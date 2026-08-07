# Travel Journal（远行手记）

一个面向个人使用的旅行管理与公开展示网站。项目采用单体 Spring Boot 工程，Vue 3 浏览器全局版页面随 Jar 一起发布，不需要 Node.js 或独立前端构建。

## 功能

- 单管理员登录、退出、修改密码和昵称
- 旅行、城市停靠点、行程管理
- 分类预算、实际支出和超支汇总
- Markdown 旅行日记、草稿、发布、撤回和区块化日记模板
- 日记模板用示例数据预览成稿效果，搭建模板时实时可见，每种区块带说明并可选数据取值范围
- 编辑与预览可锁定同步滚动，工具栏覆盖标题、强调、列表、链接、代码和表格
- 后台侧边栏可折叠为图标条
- JPEG、PNG、WebP 图片上传、缩略图、正文插图、图片库拖拽排序和图注
- 所见即所得的图片版式面板：尺寸、对齐、文字环绕、通栏出血、裁剪比例与焦点、画框、圆角、色调、交互动效、图注位置，插入后点预览即可重新编辑
- 九种画框：无框、细描边、相纸白边、浮起阴影、宝丽来、手账胶带、胶片边框、旅行明信片，全部纯 CSS 绘制不依赖图片素材
- 暖色、复古、黑白三档色调，以及悬停浮起、缓慢放大、轻微倾斜三种动效，减少动态效果时自动关闭
- 并排、网格、瀑布流、拼贴、杂志、故事流、错落画廊、轮播、胶片条和前后对比十种多图展示模式，灯箱支持同组翻页
- 图片全部由作者安排在正文里，公开端不再在文末自动重复一遍图片墙
- 地点搜索、地图选点、逆地理编码、旅行路线和可筛选城市足迹地图
- 公开首页、旅行列表和日记详情
- 桌面端和手机端响应式布局
- 远行手记与三亚海风预设、可视化主题 DIY，以及全站/旅行/日记三级主题覆盖

## 技术栈

- Java 21、Spring Boot 3.5
- Spring Security Session、BCrypt、CSRF
- MyBatis-Plus、PostgreSQL、Flyway
- MinIO Java SDK、Thumbnailator、Apache Tika
- Vue 3、Vue Router、Element Plus、Axios、Leaflet、marked、DOMPurify 浏览器版
- Maven、Docker 多阶段构建

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

地图搜索是可选能力。需要使用时，在高德开放平台创建“Web 服务”Key，并配置 `AMAP_WEB_SERVICE_KEY`。Key 仅由后端请求高德接口，不会发送到浏览器；未配置时仍可通过地图点选和手工坐标保存地点。

APP_ADMIN_PASSWORD 只在 admin_user 表为空时用于创建初始管理员。创建完成后不会覆盖数据库中的密码，也不会在日志中输出明文。

生产密码建议不少于 16 位。首次登录后可通过认证接口修改密码。

## 本地运行

确保 JAVA_HOME 指向 JDK 21。

Linux/macOS：

~~~bash
mvn clean test
mvn spring-boot:run
~~~

Windows PowerShell：

~~~powershell
$env:JAVA_HOME = "D:\java\environment\jdk21"
mvn clean test
mvn spring-boot:run
~~~

访问：

- 公开网站：http://localhost:8080/
- 管理后台：http://localhost:8080/admin/
- 健康检查：http://localhost:8080/actuator/health
- OpenAPI：http://localhost:8080/swagger-ui.html

## 图片与 Markdown

新日记需要先保存为草稿再上传图片。插入时可以选择小、中、大、通栏以及左、中、右对齐，编辑器会写入受控的站内 HTML：

~~~markdown
<figure class="journal-figure journal-figure--medium journal-figure--center">
  <img src="/api/media/123/display" alt="海边落日" loading="lazy">
  <figcaption>海边落日</figcaption>
</figure>
~~~

正文不保存 MinIO 对象键或临时预签名地址。媒体接口会检查日记是否公开：

- 草稿图片仅管理员可访问。
- 已发布日记的展示图和缩略图可公开访问。
- 原图仅管理员可访问。
- 鉴权通过后，接口使用 302 跳转到短期 MinIO 预签名地址。

删除仍被正文、日记封面或旅行封面引用的图片会被拒绝。

## 日记模板

后台“日记模板”内置城市一日游、多日旅行总结、美食探店、景点打卡、图片日记和旅途随笔。系统模板可复制为个人模板，再自由添加、复制、删除和排序区块。

模板生成时会读取当前旅行的城市路线、当天行程、支出和已上传图片。生成结果仍是 Markdown/受控 HTML，可以继续自由编辑；日记会保存模板版本、填写数据和模板快照，后续修改模板不会破坏历史日记。

## 主题设计

后台“主题外观”可以直接使用内置预设，也可以复制或新建个人主题。设计器支持色彩、字体、阅读字号、页面宽度、内容密度、圆角、图片比例/风格、动效设置，并提供真实网站的桌面和手机实时预览、撤销/重做、阅读对比度提醒以及 JSON 导入导出。

主题按以下顺序覆盖：

~~~text
单篇日记主题 > 所属旅行主题 > 全站主题 > 系统默认主题
~~~

个人主题只保存受控的语义化设计 Token，不接受任意 CSS、JavaScript 或远程脚本。

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
mvn clean test
mvn clean package
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
- 主题 Token 白名单与危险颜色值校验
- 图片上传处理
- 空 PostgreSQL 的 Flyway 迁移（本机有 Docker 时运行）

前端 JavaScript 可使用 Node.js 的 check 模式做语法检查，但运行项目不依赖 Node.js：

~~~bash
node --check src/main/resources/static/js/common/api.js
node --check src/main/resources/static/js/common/theme.js
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
├── journaltemplate
├── map
├── media
├── publicapi
├── theme
└── trip
~~~

完整需求、接口和视觉规范见 travel-journal-development-spec.md。
