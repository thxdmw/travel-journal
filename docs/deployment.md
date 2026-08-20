# 部署与运维

面向部署这个项目的人。开发相关的验证入口见 [PROJECT.md](../PROJECT.md#验证)。

## 技术栈

- Java 21、Spring Boot 3.5、Spring Security Session（BCrypt、CSRF）
- MyBatis-Plus、PostgreSQL、Flyway
- MinIO Java SDK、Thumbnailator、Apache Tika
- Vue 3 + TypeScript，经 Vite 打包后随 Jar 发布（不走 CDN）
- Anthropic Java SDK（仅在配置了 API Key 时才建客户端）
- Maven、Docker 多阶段构建

PostgreSQL 和 MinIO 由使用者自行管理，本项目不创建也不托管这两个服务。

## 环境准备

### PostgreSQL

创建数据库和专用账号，示例：

~~~sql
create user travel_journal with password '请替换为强密码';
create database travel_journal owner travel_journal;
~~~

应用启动时 Flyway 会自动创建和升级表结构，不需要手工导入 SQL。

### MinIO

提前创建私有 Bucket，默认名称为 travel-journal，并为应用 Access Key 授予该 Bucket 的读取、写入和删除权限。

项目不会自动创建 Bucket，也不会修改 Bucket 的公开策略。

## 配置

复制环境变量示例：

~~~bash
cp .env.example .env
~~~

至少修改：

- DB_HOST、DB_PORT、DB_NAME、DB_USERNAME、DB_PASSWORD
- MINIO_ENDPOINT、MINIO_ACCESS_KEY、MINIO_SECRET_KEY、MINIO_BUCKET
- APP_ADMIN_USERNAME、APP_ADMIN_PASSWORD
- APP_BASE_URL
- APP_SITE_TIMEZONE

对象存储的三项没有默认值，缺任何一项应用会拒绝启动。配置文件里不保留任何凭证：`application.yml` 会随代码进仓库，写进去的密钥等同于公开发布。

`APP_SITE_TIMEZONE` 决定季节主题按哪个时区判断当前是春夏秋冬，填站点主人常驻的地方。这里刻意不用访客设备的时区——这是一个人的旅行站，东京和悉尼的访客应该在同一天看到同一套视觉。

地图的“地点搜索”和“底图展示”是两套独立配置：

- 地点搜索仍使用高德 Web 服务 API。需要时配置 `AMAP_WEB_SERVICE_KEY`；它只由后端调用，不会发送到浏览器。未配置时仍可地图选点或手工录入坐标。
- 底图展示支持 `AUTO` / `AMAP` / `OSM`。`AUTO` 根据可信代理注入到 `APP_MAP_GEO_HEADER` 指定 header 的访客国家码选择：中国大陆用高德，其他地区用 OSM；判断不到时使用 `APP_MAP_DISPLAY_FALLBACK`。
- 高德展示使用官方 JS API 2.0，需要单独的 `AMAP_JS_KEY` 与 `AMAP_SECURITY_CODE`。安全密钥只留在服务端，由 `/api/public/_AMapService` 同源代理追加，不能写进前端或仓库。
- OSM 继续由本地 Leaflet 加载，瓦片模板和署名可通过 `OSM_TILE_URL`、`OSM_ATTRIBUTION` 替换。瓦片不会经过 Spring Boot，也不会存入 MinIO。

如果没有配置 `AMAP_JS_KEY`，`AUTO` 会使用 OSM，界面中的手动“高德”选项会禁用。具体变量与默认值见 `.env.example`。

AI 整理也是可选能力。配置 `ANTHROPIC_API_KEY` 即启用，不配就不显示那个按钮，随手记照常可以整理成日记，只是不润色文字。

APP_ADMIN_PASSWORD 只在 admin_user 表为空时用于创建初始管理员。创建完成后不会覆盖数据库中的密码，也不会在日志中输出明文。生产环境首次启动必须提供至少 16 位且不是常见默认值的强密码；缺失或过弱时应用会拒绝启动。已有管理员的环境可留空。

生产密码建议不少于 16 位。首次登录后可通过认证接口修改密码。

## 本地运行

确保 JAVA_HOME 指向 JDK 21。

首次运行或修改前端后，先构建 Vite 部署目录：

~~~bash
npm ci --prefix frontend
npm run build --prefix frontend
~~~

Linux/macOS：

~~~bash
mvn clean test
mvn spring-boot:run
~~~

Windows PowerShell：

~~~powershell
$env:JAVA_HOME = "D:\java\environment\jdk21"
npm ci --prefix frontend
npm run build --prefix frontend
mvn clean test
mvn spring-boot:run
~~~

`frontend/` 是唯一前端源码目录。`src/main/resources/static/` 不再保存或跟踪任何文件；`npm run build --prefix frontend` 只生成被 Git 忽略的 `frontend/dist/`，Maven 在打包时把它复制到 `target/classes/static/`。生产 Docker 镜像与 Drone CI 会先重建前端，再打包 Spring Boot Jar。

访问：

- 公开网站：http://localhost:8080/
- 管理后台：http://localhost:8080/admin/
- 健康检查：http://localhost:8080/actuator/health
- OpenAPI：http://localhost:8080/swagger-ui.html

## Maven 构建

~~~bash
mvn clean test
mvn clean package
~~~

产物：

~~~text
target/travel-journal.jar
~~~

## Docker 部署

仓库以 Gitee 为代码与构建来源，`.drone.yml` 由 Gitee 的 push 事件触发。流水线先并行执行 Maven（包含真实 PostgreSQL Flyway 迁移）和前端 lint、类型检查、单测与构建，再启动打包后的应用运行 iPhone 13 Playwright smoke；全部通过后才连接服务器。远端也从 Gitee 获取代码，并按本次 `DRONE_COMMIT_SHA` 精确部署，避免构建期间 master 前移导致版本错配。

`deploy.sh` 会在旧容器仍运行时先构建候选镜像，随后切换容器并检查 `/actuator/health`。候选版本不健康时自动恢复上一镜像；只有通过检查的镜像才会更新 `travel-journal:latest`。部署成功后默认保留当前 release 和最近 3 个历史 release，可用 `DEPLOY_RELEASES_TO_KEEP` 调整数量，旧标签会自动清理。

构建：

~~~bash
docker build -t travel-journal:latest .
~~~

运行：

~~~bash
docker run -d \
  --name travel-journal \
  --restart unless-stopped \
  --env-file .env \
  -p 8080:8080 \
  travel-journal:latest
~~~

镜像中只包含应用。PostgreSQL 与 MinIO 地址通过环境变量连接外部服务，容器内不保存业务数据。

### 外层反向代理示例

~~~nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 25m;
}
~~~

生产环境应使用 HTTPS。应用在 prod Profile 下会为 Session Cookie 开启 Secure。

## 数据库迁移

迁移文件位于：

~~~text
src/main/resources/db/migration/
~~~

规则：

- 已部署的迁移文件禁止修改。
- 每次数据库变更新增 V2、V3 等迁移。
- 应用启动前先备份数据库。
- 空数据库会自动执行全部迁移。

## 备份建议

数据库和图片应按同一周期备份：

~~~bash
pg_dump -Fc -d travel_journal -f travel_journal.dump
mc mirror minio/travel-journal /backup/travel-journal
~~~

建议保留最近 7 天每日备份和最近 4 周每周备份，并定期验证恢复。

