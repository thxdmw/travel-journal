#!/usr/bin/env bash
#
# 在本地把 CI 的验证流程走一遍。
#
# 对应 .drone.yml 里的 verify-frontend / verify-backend / verify-mobile-smoke /
# verify-media-integration 四步，顺序和内容保持一致。最后的 deploy-from-gitee 不在这里，
# 那一步是 SSH 到生产服务器，只该由 Drone 在 master 推送时执行。
#
#   ./verify-ci.sh            # 全套
#   ./verify-ci.sh backend    # 只跑某一步：frontend | backend | smoke | media
#
# 前置：docker compose -f docker-compose.dev.yml up -d
#
# 和 CI 的已知差异，看结果时要心里有数：
#
#   * 时区。CI 容器是 UTC，开发机多半是东八区。凡是和「今天」有关的断言，两边差一天时
#     才会露馅，所以这里给 Java 测试强制加上 -Duser.timezone=UTC —— 宁可本地就红。
#   * 依赖。CI 每次 npm ci 从锁文件装干净的一套；这里直接用现有 node_modules，快得多，
#     但锁文件本身的问题查不出来。要对齐就自己先跑一次 npm ci。
#   * 浏览器。iphone-13 用的是 WebKit，本机没装会整批报 Executable doesn't exist；
#     跑 npx playwright install webkit 装上，或改用同为手机视口的 pixel-7。

set -euo pipefail

cd "$(dirname "$0")"

DB_PORT_LOCAL=5433
MINIO_PORT_LOCAL=59000
APP_URL=http://127.0.0.1:8080
ADMIN_USER=admin
ADMIN_PASS=dev-only-password-2026
SMOKE_PROJECT="${SMOKE_PROJECT:-iphone-13}"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31m×  %s\033[0m\n' "$1"; exit 1; }

require_deps() {
  curl --silent --fail --max-time 3 "http://127.0.0.1:${MINIO_PORT_LOCAL}/minio/health/live" >/dev/null \
    || fail "MinIO 没起来，先执行：docker compose -f docker-compose.dev.yml up -d"
}

verify_frontend() {
  step 'verify-frontend：lint / typecheck / 单测 / 构建'
  npm run lint --prefix frontend
  npm run typecheck --prefix frontend
  npm run test:unit --prefix frontend
  npm run build --prefix frontend
  npm run verify:build --prefix frontend
}

verify_backend() {
  step 'verify-backend：Java 测试与打包（含真实 PostgreSQL 迁移验证）'
  require_deps
  # 先删掉上一次的报告：否则这一轮就算压根没跑测试，下面的检查也会读到旧结果说「过了」
  rm -f target/surefire-reports/com.thx.traveljournal.migration.FlywayMigrationTest.txt
  FLYWAY_TEST_JDBC_URL="jdbc:postgresql://127.0.0.1:${DB_PORT_LOCAL}/travel_journal" \
  FLYWAY_TEST_DB_USERNAME=travel_journal \
  FLYWAY_TEST_DB_PASSWORD=travel_journal \
    mvn -B -ntp -DargLine="-Duser.timezone=UTC" package

  # 迁移测试连不上库时会静默跳过，那等于这一段根本没验证——在这里拦下来，
  # 而不是让一行 Skipped 混在几百行输出里过去。
  local report=target/surefire-reports/com.thx.traveljournal.migration.FlywayMigrationTest.txt
  grep -q 'Skipped: 0' "${report}" 2>/dev/null \
    || fail '迁移测试被跳过了：确认 docker-compose.dev.yml 里的 PostgreSQL 在跑'
}

# 应用起在后台，跑完 E2E 收掉。CI 那边也是这么做的。
app_pid=''
start_app() {
  require_deps
  [ -f target/travel-journal.jar ] || fail '没有 target/travel-journal.jar，先跑 backend 那一步'
  step '启动应用'
  DB_HOST=127.0.0.1 DB_PORT="${DB_PORT_LOCAL}" DB_NAME=travel_journal \
  DB_USERNAME=travel_journal DB_PASSWORD=travel_journal DB_SSL_MODE=disable \
  MINIO_ENDPOINT="http://127.0.0.1:${MINIO_PORT_LOCAL}" \
  MINIO_ACCESS_KEY=dev-minio-access MINIO_SECRET_KEY=dev-minio-secret \
  APP_ADMIN_USERNAME="${ADMIN_USER}" APP_ADMIN_PASSWORD="${ADMIN_PASS}" \
  APP_MAP_SEARCH_ENABLED=false APP_EMPTY_DRAFT_CLEANUP=false \
  SPRING_PROFILES_ACTIVE=dev \
    java -jar target/travel-journal.jar >/tmp/travel-journal-local.log 2>&1 &
  app_pid=$!
  trap 'kill "${app_pid}" >/dev/null 2>&1 || true' EXIT

  for _ in $(seq 1 60); do
    curl --silent --fail "${APP_URL}/actuator/health" >/dev/null && break
    sleep 2
  done
  curl --silent --fail "${APP_URL}/actuator/health" >/dev/null \
    || { tail -40 /tmp/travel-journal-local.log; fail '应用没起来'; }

  # 和 CI 一样先预热：登录之后的跳转还要串 /api/public/profile 和 /api/public/csrf，
  # 冷 JVM 上第一个用例会替所有人承担这段开销，慢过 15 秒就表现为「登录后不跳转」。
  for path in /admin/ /api/public/profile /api/public/csrf; do
    curl --silent --fail --output /dev/null "${APP_URL}${path}" || true
  done
}

run_e2e() {
  local project="$1" grep_tag="$2"
  # 在 frontend/ 里跑：playwright.config.ts 的 testDir 是相对它自己的位置
  ( cd frontend \
    && E2E_BASE_URL="${APP_URL}" E2E_ADMIN_USER="${ADMIN_USER}" E2E_ADMIN_PASS="${ADMIN_PASS}" \
       npx playwright test --project="${project}" --grep "${grep_tag}" )
}

verify_smoke() { step "verify-mobile-smoke：${SMOKE_PROJECT} @smoke"; run_e2e "${SMOKE_PROJECT}" '@smoke'; }
verify_media() { step 'verify-media-integration：desktop-chrome @media'; run_e2e desktop-chrome '@media'; }

case "${1:-all}" in
  frontend) verify_frontend ;;
  backend)  verify_backend ;;
  smoke)    start_app; verify_smoke ;;
  media)    start_app; verify_media ;;
  all)      verify_frontend; verify_backend; start_app; verify_smoke; verify_media ;;
  *)        fail "用法：$0 [all|frontend|backend|smoke|media]" ;;
esac

printf '\n\033[1;32m✓  本地 CI 验证通过（部署那一步不在本地跑）\033[0m\n'
