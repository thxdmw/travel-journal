#!/bin/bash

# travel-journal 生产部署：先构建候选镜像，再短暂停机切换；健康检查失败时回滚。
set -Eeuo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
step() { echo -e "${CYAN}[STEP]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

ENV_FILE="${SCRIPT_DIR}/../config/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
    error "未找到 ${ENV_FILE}，请先复制 .env.example 并填写真实配置。"
    exit 1
fi

APP_NAME="travel-journal"
CONTAINER_NAME="${APP_NAME}-container"
STABLE_IMAGE="${APP_NAME}:latest"
RELEASE_TAG="${DEPLOY_RELEASE_TAG:-$(git rev-parse --short=12 HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
if [[ ! "${RELEASE_TAG}" =~ ^[A-Za-z0-9_.-]+$ ]]; then
    error "DEPLOY_RELEASE_TAG 只能包含字母、数字、点、下划线和短横线。"
    exit 1
fi
CANDIDATE_IMAGE="${APP_NAME}:${RELEASE_TAG}"
HEALTH_RETRIES="${DEPLOY_HEALTH_RETRIES:-40}"
HEALTH_INTERVAL_SECONDS="${DEPLOY_HEALTH_INTERVAL_SECONDS:-2}"
RELEASES_TO_KEEP="${DEPLOY_RELEASES_TO_KEEP:-4}"
if [[ ! "${HEALTH_RETRIES}" =~ ^[1-9][0-9]*$ || ! "${HEALTH_INTERVAL_SECONDS}" =~ ^[1-9][0-9]*$ || ! "${RELEASES_TO_KEEP}" =~ ^[1-9][0-9]*$ ]]; then
    error "健康检查次数、间隔与镜像保留数必须是正整数。"
    exit 1
fi

# 只解析端口这一项，不 source 含密钥的 .env，避免特殊字符被 Shell 二次解释。
PORT="$(sed -n 's/^[[:space:]]*SERVER_PORT=//p' "${ENV_FILE}" | tail -n 1 | tr -d '\r')"
PORT="${PORT:-8080}"
if [[ ! "${PORT}" =~ ^[0-9]+$ ]] || ((PORT < 1 || PORT > 65535)); then
    error "SERVER_PORT 必须是 1 到 65535 的数字，当前值：${PORT}"
    exit 1
fi
HEALTH_URL="http://127.0.0.1:${PORT}/actuator/health"

export DOCKER_BUILDKIT=1
OLD_IMAGE="$(docker inspect --format '{{.Image}}' "${CONTAINER_NAME}" 2>/dev/null || true)"
if [[ -z "${OLD_IMAGE}" ]]; then
    OLD_IMAGE="$(docker image inspect --format '{{.Id}}' "${STABLE_IMAGE}" 2>/dev/null || true)"
fi

run_container() {
    local image="$1"
    docker run -d \
      --name "${CONTAINER_NAME}" \
      --network host \
      --env-file "${ENV_FILE}" \
      -e SPRING_PROFILES_ACTIVE=prod \
      -v /app/travel-journal/logs:/app/travel-journal/logs \
      --restart unless-stopped \
      "${image}"
}

healthy() {
    local attempt
    for ((attempt=1; attempt<=HEALTH_RETRIES; attempt++)); do
        if ! docker inspect --format '{{.State.Running}}' "${CONTAINER_NAME}" 2>/dev/null | grep -q true; then
            return 1
        fi
        if curl --fail --silent --max-time 3 "${HEALTH_URL}" >/dev/null; then
            return 0
        fi
        info "等待应用就绪（${attempt}/${HEALTH_RETRIES}）..."
        sleep "${HEALTH_INTERVAL_SECONDS}"
    done
    return 1
}

rollback() {
    warn "新版本未通过健康检查，开始恢复上一镜像。"
    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
    if [[ -z "${OLD_IMAGE}" ]]; then
        error "没有可回滚的上一镜像，请查看候选容器日志。"
        return 1
    fi
    if run_container "${OLD_IMAGE}" >/dev/null && healthy; then
        success "已恢复上一版本 ${OLD_IMAGE}。"
        return 0
    fi
    error "上一版本也未能恢复，请立即检查 Docker 与应用日志。"
    return 1
}

# Docker 按镜像创建时间返回标签。latest 不计入版本数，默认保留当前版本和前三个历史版本。
# 清理只匹配本项目的 release 标签；失败只告警，不影响已经通过健康检查的新服务。
cleanup_release_images() {
    local image index
    local -a releases=()
    while IFS= read -r image; do
        [[ -z "${image}" || "${image}" == "${STABLE_IMAGE}" ]] && continue
        releases+=("${image}")
    done < <(docker image ls --filter "reference=${APP_NAME}:*" --format '{{.Repository}}:{{.Tag}}')

    if ((${#releases[@]} <= RELEASES_TO_KEEP)); then
        info "release 镜像共 ${#releases[@]} 个，无需清理。"
        return 0
    fi
    for ((index=RELEASES_TO_KEEP; index<${#releases[@]}; index++)); do
        image="${releases[index]}"
        if docker image rm "${image}" >/dev/null; then
            info "已清理旧镜像 ${image}。"
        else
            warn "旧镜像 ${image} 清理失败，可稍后手动检查。"
        fi
    done
}

step "构建候选镜像 ${CANDIDATE_IMAGE}（现有服务继续运行）..."
docker build -t "${CANDIDATE_IMAGE}" .

step "切换到候选镜像..."
if docker inspect "${CONTAINER_NAME}" >/dev/null 2>&1; then
    docker stop "${CONTAINER_NAME}" >/dev/null
    docker rm "${CONTAINER_NAME}" >/dev/null
fi

if ! run_container "${CANDIDATE_IMAGE}" >/dev/null; then
    error "候选容器启动失败。"
    rollback || true
    exit 1
fi

if ! healthy; then
    docker logs --tail 120 "${CONTAINER_NAME}" || true
    rollback || true
    exit 1
fi

# 只有已验证的候选镜像才更新 latest；旧镜像 ID 仍保留，可供下一次部署回滚。
docker tag "${CANDIDATE_IMAGE}" "${STABLE_IMAGE}"
success "部署完成：${CANDIDATE_IMAGE} 已通过健康检查。"
cleanup_release_images || warn "旧 release 镜像清理未完成，不影响当前版本运行。"
info "应用地址：http://localhost:${PORT}"
info "查看日志：docker logs -f ${CONTAINER_NAME}"
