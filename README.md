# Travel Journal（远行手记）

一个面向个人使用的旅行管理与公开展示网站。项目采用单体 Spring Boot 工程，Vue 3 浏览器全局版页面随 Jar 一起发布，不需要 Node.js 或独立前端构建。

## 功能

- 单管理员登录、退出、修改密码和昵称
- 旅行、城市停靠点、行程管理
- 分类预算、实际支出和超支汇总
- 结构化旅行日记、草稿、发布、更新发布、撤回和区块化日记模板
- 以 Blocks JSON 作为正文唯一数据源，不保存 Markdown、任意 HTML 或第二套预览文本
- 正文里直接连续写作：段落、小标题、引用和提示卡不弹窗，回车分段、退格合并，段内换行有独立按钮（手机键盘没有 Shift）
- 发布前可就地预览整篇文章，用的是和公开页面同一套渲染
- 打开编辑器即建草稿，标题和 slug 可以留到发布前再补；停手自动保存，正文快照存本机 IndexedDB
- 照片选完立刻插入正文并显示上传进度，并发上传、单张失败可重试
- 26 种可视化内容块，覆盖正文、提示、信息清单、表格、同行者、地点、美食、住宿、交通、天气、图片组和明信片等旅行场景
- 日记模板生成可继续独立编辑的内容块；模板版本用于标识来源，后续修改模板不会覆盖已写正文
- 后台侧边栏可折叠为图标条
- JPEG、PNG、WebP 图片选择、拖放或粘贴上传，支持缩略图预览、多选插入、图注、封面、批量删除和拖拽排序
- 图片设置采用正文画布预览，按“内容、版式、外观、图注”分组；只展示当前排版真正生效的设置
- 图片尺寸支持小图、中等、大图、正文宽度与通栏出血，并在预览中用文字栏参照展示实际占位
- 九种画框：无框、细描边、相纸白边、浮起阴影、宝丽来、手账胶带、胶片边框、旅行明信片，全部纯 CSS 绘制不依赖图片素材
- 暖色、复古、黑白三档色调，以及悬停浮起、缓慢放大、轻微倾斜三种动效，减少动态效果时自动关闭
- 并排、网格、瀑布流、拼贴、杂志、故事流、错落画廊、轮播、胶片条和前后对比十种多图展示模式，灯箱支持同组翻页；胶片条支持触控、鼠标拖动和滚轮浏览
- 图片全部由作者安排在正文里，公开端不再在文末自动重复一遍图片墙
- 地点搜索、地图选点、逆地理编码、旅行路线和可筛选城市足迹地图
- 公开首页、旅行列表和日记详情
- 桌面端和手机端响应式布局；移动端图片设置固定预览并使用 Tab 切换，兼容安全区、动态浏览器底栏和软键盘可视视口
- 远行手记与三亚海风预设、可视化主题 DIY，以及全站/旅行/日记三级主题覆盖

## 技术栈

- Java 21、Spring Boot 3.5
- Spring Security Session、BCrypt、CSRF
- MyBatis-Plus、PostgreSQL、Flyway
- MinIO Java SDK、Thumbnailator、Apache Tika
- Vue 3、Vue Router、Element Plus、Axios、Leaflet 浏览器版
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

## 区块日记与图片

打开编辑器就会自动开一篇草稿，标题、slug、日期都可以之后再补，拍照和打字立刻可用。正文保存在 `journal_entry.content_json`，协议由 `schemaVersion` 和 `blocks` 组成：

~~~json
{
  "schemaVersion": 1,
  "blocks": [
    {
      "id": "block_example_01",
      "type": "image",
      "version": 1,
      "title": "今日照片",
      "data": { "mediaId": 123, "caption": "海边落日" },
      "settings": { "size": "medium", "align": "center", "frame": "paper" }
    }
  ]
}
~~~

前端编辑、模板生成、后端校验、公开渲染和备份都读写同一份 JSON。后端拒绝未知区块、重复标识、非法图片设置及不属于当前日记的媒体编号。

正文不保存 MinIO 对象键或临时预签名地址。媒体接口会检查日记是否公开：

- 草稿图片仅管理员可访问。
- 已发布日记的展示图和缩略图可公开访问。
- 原图仅管理员可访问。
- 鉴权通过后，接口使用 302 跳转到短期 MinIO 预签名地址。

删除仍被正文、日记封面或旅行封面引用的图片会被拒绝。

## 日记模板

后台“日记模板”内置城市一日游、多日旅行总结、美食探店、景点打卡、图片日记和旅途随笔。系统模板可复制为个人模板，再自由添加、复制、删除和排序区块。

模板生成时会读取当前旅行的城市路线、当天行程、支出和已上传图片。生成结果是普通 Blocks JSON，可以继续自由编辑；日记仅保存模板编号和生成时版本，不保留第二套模板运行态正文。

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
- src/main/resources/static/js/admin-app.js：管理后台的路由与挂载
- src/main/resources/static/js/admin/：后台各页面（shared、trip-workspace、journal-editor、studio）
- src/main/resources/static/js/common/journal-blocks.js：区块协议、默认值和统一渲染器
- src/main/resources/static/js/common/journal-block-editor.js：区块编辑组件，含正文的 inline 编辑
- src/main/resources/static/js/common/local-draft.js：草稿的本机 IndexedDB 仓库
- src/main/resources/static/js/common/journal-media.js：轮播、胶片条、对比和图片灯箱行为
- src/main/resources/static/css/admin-shell.css 等五个后台样式文件（见 docs/journal-editor.md 的分工说明）
- src/main/resources/static/css/journal-blocks.css：区块公开样式
- src/main/resources/static/css/journal-media.css：后台与公开端共用的图片版式
- src/main/resources/static/css/themes/travel-classic.css：默认主题变量

后台的 JS 与 CSS 拆成多个职责单一的文件，但都不走模块系统和打包：`js/admin/shared.js` 先建立 `window.AdminShared`，各页面把组件注册到 `window.AdminPages`，`admin-app.js` 最后取用。CSS 的引入顺序即层叠顺序，`admin/index.html` 里不能随意调换。

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
- 日记草稿与发布的两套校验（草稿允许空标题空正文，发布严格）
- 空草稿回收与自动 slug 生成
- Blocks JSON 协议、扩展区块与图片外观设置校验
- 主题 Token 白名单与危险颜色值校验
- 图片上传处理
- 空 PostgreSQL 的 Flyway 迁移（本机有 Docker 时运行）

前端 JavaScript 可使用 Node.js 的 check 模式做语法检查，但运行项目不依赖 Node.js：

~~~bash
find src/main/resources/static/js -name '*.js' -exec node --check {} \;
~~~

移动端布局还有一套可选的 Playwright 端到端测试，覆盖 iPhone 13、Pixel 7 和桌面 Chrome。它只是开发依赖，**不参与 Maven 打包和 Docker 构建**，运行和部署项目仍然不需要 Node.js。需要一个已经跑起来的应用实例：

~~~bash
npm install && npx playwright install chromium
E2E_BASE_URL=http://localhost:8080 E2E_ADMIN_USER=admin E2E_ADMIN_PASS=你的密码 npx playwright test
~~~

用例在 `e2e/journal-mobile.spec.ts`，覆盖新建即草稿、连续写作不弹窗、退格合并、刷新恢复、空标题被拦、发布、空草稿回收，以及手机端的单一滚动、底栏可见和 Bottom Sheet 开合。

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

日记区块协议、图片设置语义和扩展约定见 [docs/journal-editor.md](docs/journal-editor.md)。
