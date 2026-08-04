# Travel Journal（远行手记）

一个面向个人使用的旅行管理与公开展示网站。项目采用单体 Spring Boot 工程，Vue 3 浏览器全局版页面随 Jar 一起发布，不需要 Node.js 或独立前端构建。

## 功能

- 单管理员登录、退出和修改密码
- 旅行、城市停靠点、行程管理
- 分类预算、实际支出和超支汇总
- Markdown 旅行日记、草稿、发布与撤回
- JPEG、PNG、WebP 图片上传、缩略图、正文插图和封面
- 公开首页、旅行列表、日记详情和城市足迹地图
- 桌面端和手机端响应式布局
- 只读主题功能占位，默认主题为 travel-classic

## 技术栈

- Java 21、Spring Boot 3.5
- Spring Security Session、BCrypt、CSRF
- MyBatis-Plus、PostgreSQL、Flyway
- MinIO Java SDK、Thumbnailator、Apache Tika
- Vue 3、Vue Router、Element Plus、Axios、Leaflet、marked、DOMPurify 浏览器版
- Maven Wrapper、Docker 多阶段构建

PostgreSQL 和 MinIO 由使用者自行管理，本项目不创建或托管这两个服务。

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

APP_ADMIN_PASSWORD 只在 admin_user 表为空时用于创建初始管理员。创建完成后不会覆盖数据库中的密码，也不会在日志中输出明文。

生产密码建议不少于 16 位。首次登录后可通过认证接口修改密码。

## 本地运行

确保 JAVA_HOME 指向 JDK 21。

Linux/macOS：

~~~bash
./mvnw clean test
./mvnw spring-boot:run
~~~

Windows PowerShell：

~~~powershell
$env:JAVA_HOME = "D:\java\environment\jdk21"
.\mvnw.cmd clean test
.\mvnw.cmd spring-boot:run
~~~

访问：

- 公开网站：http://localhost:8080/
- 管理后台：http://localhost:8080/admin/
- 健康检查：http://localhost:8080/actuator/health
- OpenAPI：http://localhost:8080/swagger-ui.html

## 图片与 Markdown

新日记需要先保存为草稿再上传图片。图片上传成功后，编辑器会在正文中插入稳定地址：

~~~markdown
![图片说明](/api/media/123/display)
~~~

正文不保存 MinIO 对象键或临时预签名地址。媒体接口会检查日记是否公开：

- 草稿图片仅管理员可访问。
- 已发布日记的展示图和缩略图可公开访问。
- 原图仅管理员可访问。
- 鉴权通过后，接口使用 302 跳转到短期 MinIO 预签名地址。

删除仍被正文、日记封面或旅行封面引用的图片会被拒绝。

## 前端说明

前端文件位于 src/main/resources/static，不存在 package.json，也没有 npm 构建步骤。

主要入口：

- src/main/resources/static/index.html：公开端
- src/main/resources/static/admin/index.html：管理端
- src/main/resources/static/js/public-app.js：公开页面
- src/main/resources/static/js/admin-app.js：管理后台
- src/main/resources/static/css/themes/travel-classic.css：默认主题变量

前端依赖使用锁定版本的 CDN 地址。主题颜色、字体、圆角和阴影均通过 CSS 变量控制。

## Maven 构建

~~~bash
./mvnw clean test
./mvnw clean package
~~~

产物：

~~~text
target/travel-journal.jar
~~~

## Docker 部署

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

## 测试

当前自动化测试覆盖：

- Slug 处理
- 登录失败限流
- 旅行日期校验
- 预算汇总和超支判断
- 日记草稿与发布校验
- 图片上传处理
- 空 PostgreSQL 的 Flyway 迁移（本机有 Docker 时运行）

前端 JavaScript 可使用 Node.js 的 check 模式做语法检查，但运行项目不依赖 Node.js：

~~~bash
node --check src/main/resources/static/js/common/api.js
node --check src/main/resources/static/js/public-app.js
node --check src/main/resources/static/js/admin-app.js
~~~

## 项目结构

~~~text
src/main/java/com/thx/traveljournal/
├── auth
├── budget
├── common
├── config
├── itinerary
├── journal
├── media
├── publicapi
└── trip
~~~

完整需求、接口和视觉规范见 travel-journal-development-spec.md。
