#!/bin/bash

# 部署脚本 - travel-journal 生产环境部署
set -e

# 定义颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 彩色输出函数
info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

# 始终切换到脚本所在目录，确保从任意路径执行时 Dockerfile、.env 和构建上下文一致。
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# 非 Compose 部署通过 docker --env-file 读取配置，密钥包含 &、*、# 时也不会被 Shell 误解析。
ENV_FILE="${SCRIPT_DIR}/../config/.env"
if [ -f "${ENV_FILE}" ]; then
    success "使用生产环境变量文件: ${ENV_FILE}"
else
    error "未找到 ${ENV_FILE}，请先复制 .env.example 并填写真实配置。"
    exit 1
fi

info "开始部署 travel-journal 应用..."

# 配置变量
APP_NAME="travel-journal"
IMAGE_NAME="${APP_NAME}:latest"
CONTAINER_NAME="${APP_NAME}-container"
PORT=20007

# 【关键】强制启用 BuildKit，否则 Dockerfile 中的 --mount=type=cache 不生效
export DOCKER_BUILDKIT=1

# 停止并删除旧容器
step "停止并删除旧容器..."
docker stop ${CONTAINER_NAME} || true
docker rm ${CONTAINER_NAME} || true

# ⚠️ 【已移除】不再执行 docker rmi ${IMAGE_NAME}
# 原因：删除旧镜像会清除 Docker 层缓存，导致 BuildKit 缓存挂载的优势被部分抵消
# Docker 会自动管理悬空镜像，无需手动清理

# 构建新镜像（BuildKit 已通过环境变量全局启用）
step "构建 Docker 镜像（BuildKit + 缓存挂载模式）..."
docker build -t ${IMAGE_NAME} .

# 运行新容器
step "启动新容器..."
docker run -d \
  --name ${CONTAINER_NAME} \
  --network host \
  --env-file "${ENV_FILE}" \
  -e SPRING_PROFILES_ACTIVE=prod \
  -v /app/travel-journal/logs:/app/travel-journal/logs \
  --restart unless-stopped \
  ${IMAGE_NAME}

success "部署完成！"
info "应用访问地址: http://localhost:${PORT}"
info "查看日志: docker logs -f ${CONTAINER_NAME}"
