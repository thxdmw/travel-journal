# Travel Journal（远行手记）

一个会随四季变化、帮你随手记录并重新回到旅途现场的个人旅行日记。项目采用单体 Spring Boot 工程，Vue 3 浏览器全局版页面随 Jar 一起发布，不需要 Node.js 或独立前端构建。

## 功能

- 单管理员登录、退出、修改密码和昵称
- 旅行、城市停靠点、行程管理
- 分类预算、实际支出和超支汇总
- 随手记：路上二十秒记一条（一句话、几张照片、一个地点），晚上一键整理成带开场、章节和照片的日记草稿
- 日记可先于旅行独立创建，也可从旅行工作台进入或稍后归入旅行；支持草稿、发布、更新发布和撤回
- 以 Blocks JSON 作为正文唯一数据源，不保存 Markdown、任意 HTML 或第二套预览文本
- 正文里直接连续写作：段落、小标题、引用和提示卡不弹窗，回车按普通输入换行，“＋正文”另起组件，段首退格可与上一组件合并
- 发布前可就地预览整篇文章，用的是和公开页面同一套渲染
- 侧栏“写日记”会直接建立独立草稿，不要求先建旅行；标题和 slug 可以留到发布前再补，停手自动保存
- 照片选完立刻插入正文并显示上传进度，并发上传但保持挑选顺序，单张失败可重试
- 照片本身也进 IndexedDB：断网拍照、浏览器被系统杀掉，重新打开照片还在，有网自动续传
- 可「添加到桌面」的 PWA，离线仍能打开编辑器接着写
- 29 种可视化内容块，覆盖正文、提示、信息清单、表格、同行者、地点、美食、住宿、交通、天气、图片组和明信片等旅行场景
- 今日开场卡、章节节点和今日小结，城市、第几天、路线和花费从旅行工作台自动填
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
- 日记页附带当天路线，可以按时间「回放这一天」，每个点带上当时写的话和拍的照片
- 公开首页、旅行列表和日记详情
- 桌面端和手机端响应式布局；移动端图片设置固定预览并使用 Tab 切换，软键盘弹出后工具栏与真实光标行保持可见
- 六套系统主题（远行经典、复古、春夏秋冬），可跟随季节自动轮换，也可固定用某一套
- 主题不只是配色：装饰、贴纸、分隔线、氛围层、Block 皮肤和互动一起构成一套完整视觉
- 可视化主题 DIY、JSON 导入导出，以及全站/旅行/日记三级主题覆盖
- 可选的 AI 整理：把随手记的碎片句子润色成段落，只改文字不改结构

## 技术栈

- Java 21、Spring Boot 3.5
- Spring Security Session、BCrypt、CSRF
- MyBatis-Plus、PostgreSQL、Flyway
- MinIO Java SDK、Thumbnailator、Apache Tika
- Vue 3、Vue Router、Element Plus、Axios、Leaflet 浏览器版（全部随 Jar 发布，不走 CDN）
- Anthropic Java SDK（仅在配置了 API Key 时才建客户端；不配就不启用 AI 整理）
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
- APP_SITE_TIMEZONE

对象存储的三项没有默认值，缺任何一项应用会拒绝启动。配置文件里不保留任何凭证：`application.yml` 会随代码进仓库，写进去的密钥等同于公开发布。

`APP_SITE_TIMEZONE` 决定季节主题按哪个时区判断当前是春夏秋冬，填站点主人常驻的地方。这里刻意不用访客设备的时区——这是一个人的旅行站，东京和悉尼的访客应该在同一天看到同一套视觉。

地图搜索是可选能力。需要使用时，在高德开放平台创建“Web 服务”Key，并配置 `AMAP_WEB_SERVICE_KEY`。Key 仅由后端请求高德接口，不会发送到浏览器；未配置时仍可通过地图点选和手工坐标保存地点。

AI 整理也是可选能力。配置 `ANTHROPIC_API_KEY` 即启用，不配就不显示那个按钮，随手记照常可以整理成日记，只是不润色文字。

APP_ADMIN_PASSWORD 只在 admin_user 表为空时用于创建初始管理员。创建完成后不会覆盖数据库中的密码，也不会在日志中输出明文。生产环境首次启动必须提供至少 16 位且不是常见默认值的强密码；缺失或过弱时应用会拒绝启动。已有管理员的环境可留空。

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

打开编辑器就会自动开一篇草稿，`trip_id = null` 表示独立日记，之后可在“所属旅行（可选）”中归入旅行；从旅行工作台进入则继续自动携带 `tripId`。标题、slug、日期都可以之后再补，拍照和打字立刻可用。正文保存在 `journal_entry.content_json`，协议由 `schemaVersion` 和 `blocks` 组成：

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

## 随手记与整理

随手记（Moments）和日记不是同一个东西，所以没有复用 `journal_entry`：日记是晚上坐下来写的那一篇，有标题、有结构、要发布；随手记是走在路上顺手按下的一句话加一张照片，它的价值在于「当时」。

写入路径刻意做得很宽松——除了「属于哪次旅行」之外没有任何必填项。一次校验失败弹窗就足以让「二十秒记完」这件事失败，而记不下来的那一条就永远不存在了。

晚上按「整理成日记」，当天的碎片会按时间变成一篇草稿：

~~~text
今日开场卡（城市 · Day N / 日期 / 路线 / 关键数字）
  10:23 · 浅草        ← 章节节点
  正文
  照片
  11:40 · 上野
  ...
~~~

照片复用同一份 `media_asset` 不重新上传；原始随手记保留下来（回填 `journal_entry_id`），这样「那天到底发生了什么」永远还能翻回最初写下的样子。同一天可以整理多次，默认追加，也可以选择重新生成整篇。

整理过程会锁定本次可处理的随手记，并只接收「尚未整理」或「已属于当前目标日记」的记录；已被其他日记占用的记录不会被重复拿走。重复点击、请求重放或并发整理也不会把同一批内容写进两篇日记。

日记页附带当天路线。路线优先取随手记的坐标（实际去过，实线），没有随手记时才回落到当天的城市和行程（计划要去，虚线）——计划里写了但没去成的地方不该出现在回放里。

AI 整理是叠在上面的可选一层，**只改文字，不改结构**。顺序、时间、地点、照片归属全部由规则决定，模型只负责把碎片句子串成能读的话。理由是前者必须百分之百可靠，而它们恰好是规则最擅长的。没配 Key、网络不通、模型拒答、返回内容对不上——每一种都退回原文，整理照常完成。

## 离线与 PWA

前端依赖全部随 Jar 发布，加上 `manifest.json` 和 `service-worker.js`，可以「添加到桌面」。

照片选中后先把 Blob 落进 IndexedDB 再开始传。`File` 只活在内存里，浏览器被系统杀掉就没了；存下来之后，断网拍照 → 继续写 → 浏览器被杀 → 重新打开 → 照片还在 → 有网自动续传。直接存 Blob 而不转 base64，是因为一张 4MB 的照片转成 base64 是 5.5MB 的字符串，十几张就能把手机浏览器的内存吃光。

随手记也采用完整离线队列：文字、发生时间和照片先在同一个 IndexedDB 命令中提交成功，页面才会清空输入。每条随手记和每张照片都有设备端幂等标识，断网重试、刷新页面或上传中途恢复都只会补齐未完成部分，不会重复创建。待同步列表可手动重试或明确放弃。

时间同时保存绝对时刻、事件发生地的当地日期、IANA 时区和 UTC 偏移。因此跨时区旅行时，东京深夜记录不会因为站点部署在上海或数据库使用 UTC 而落到错误的一天；筛选、路线和整理均按事件当地日期进行。

后台在成功登录后只缓存显示离线外壳所需的最小会话提示。PWA 被彻底关闭后也能在断网时重新进入随手记页；恢复网络后会先向服务端重新验证会话，再继续同步。本地提示不替代服务端鉴权，所有 API 仍由 Spring Security 校验。

Service Worker 的缓存策略按用途分，不是一刀切：

| 内容 | 策略 | 理由 |
| --- | --- | --- |
| 应用外壳（HTML/CSS/JS） | stale-while-revalidate | 秒开，后台更新；资源都带 `?v=` 版本号 |
| 图片（`/api/media/…`） | cache-first | 内容不会变，换图会换 id |
| 其他 `/api` | **完全不缓存** | 编辑器拿到一份缓存的旧正文，作者在上面接着改，保存回去就等于把之前写的抹掉了 |

写请求一律直连。宁可失败——失败是看得见的，静默的数据回退不是。

## 主题设计

系统提供六套主题：远行经典、复古、春日漫游、盛夏出逃、秋日远行、冬日旅途。数量刻意克制——想玩别的风格走「复制主题后自己改」或导入 JSON，系统预设只负责最有辨识度的那几种。

全站主题有两种模式：

| 模式 | 行为 |
| --- | --- |
| `AUTO`（默认） | 跟随季节。3–5 月春、6–8 月夏、9–11 月秋、12–2 月冬，到点自己换，作者什么都不用做 |
| `FIXED` | 作者手动选定了某一套，季节更替不再影响它，直到重新点「跟随季节」 |

季节按 `APP_SITE_TIMEZONE` 判断，不是访客设备时区。

主题按以下顺序覆盖：

~~~text
单篇日记主题 > 所属旅行主题 > 全站 FIXED > 全站 AUTO（当季）
~~~

主题配置不只是配色。除了 colors、typography、shape、layout、card、background、image、gallery、motion、effects、map、hero 这些视觉参数，还有决定「页面有没有性格」的六个区块：

| 区块 | 内容 |
| --- | --- |
| `decorations` | 页面四角线稿、页边点缀、标题纹样 |
| `stickers` | 贴纸：密度 + 一份 `{asset, area}` 列表 |
| `dividers` | 章节分隔线的线型与中间符号 |
| `ambient` | 比粒子更安静的一层：一片很淡的光，或一分钟才移动一点的云 |
| `blockStyles` | 同一个内容块在不同主题里长得不一样 |
| `interactions` | 点击贴纸、鼠标经过照片、封面入场 |

有了这些，从夏切到秋才会是「海浪和太阳换成落叶和车票」，而不只是蓝色变成橙色。

三条安全边界：

- **贴纸位置走白名单**（`hero-right`、`section-gap` 等七个区域），不接受 `left:1782px` 这样的绝对坐标。坐标在手机上一定会错位，而且每加一个断点就要把所有主题重调一遍。
- **素材名只认 `^[a-z0-9-]+$`**，最终拼成 `/assets/themes/stickers/{asset}.svg`，配置里不出现任意 URL。
- **互动只收枚举**，永远不收 JavaScript。主题是可以导入导出的 JSON，一旦允许里面写代码，导入别人的主题就等于执行别人的脚本。

贯穿整套设计的原则是：这些东西用来**填补页面的空旷感，不是用来填满页面**。透明度都压得很低，手机上只保留两张贴纸——正文永远比装饰重要。

素材全部是 SVG（`static/assets/themes/stickers/`）：体积小、高清、容易换颜色，手机上也清晰。

后台“主题外观”可以直接使用系统预设，也可以复制或新建个人主题。设计器支持上述全部区块，并提供真实网站的桌面和手机实时预览、撤销/重做、阅读对比度提醒以及 JSON 导入导出。个人主题只保存受控的语义化设计 Token，不接受任意 CSS、JavaScript 或远程脚本。

## 前端说明

前端文件位于 src/main/resources/static，不需要 npm 打包；根目录 package.json 只提供 JavaScript 语法检查和 Playwright 端到端测试命令，运行应用不依赖 Node.js。

主要入口：

- src/main/resources/static/index.html：公开端
- src/main/resources/static/admin/index.html：管理端
- src/main/resources/static/js/public-app.js：公开页面
- src/main/resources/static/js/admin-app.js：管理后台的路由与挂载
- src/main/resources/static/js/admin/：后台各页面（shared、trip-workspace、journal-editor、moments、studio）
- src/main/resources/static/js/common/journal-blocks.js：区块协议、默认值和统一渲染器
- src/main/resources/static/js/common/journal-block-editor.js：区块编辑组件，含正文的 inline 编辑
- src/main/resources/static/js/common/local-draft.js：草稿与待上传照片的本机 IndexedDB 仓库
- src/main/resources/static/js/common/journal-media.js：轮播、胶片条、对比和图片灯箱行为
- src/main/resources/static/js/common/theme.js：把主题 Token 铺成 CSS 变量和 `data-*` 属性
- src/main/resources/static/js/common/theme-effects.js：粒子、滚动揭示和贴纸的运行时
- src/main/resources/static/js/common/day-route.js：当天路线的地图打点、连线与回放
- src/main/resources/static/js/common/pwa.js：Service Worker 注册与离线横幅
- src/main/resources/static/service-worker.js、manifest.json：PWA 入口
- src/main/resources/static/css/admin-shell.css 等六个后台样式文件（见 docs/journal-editor.md 的分工说明）
- src/main/resources/static/css/journal-blocks.css：区块公开样式
- src/main/resources/static/css/journal-media.css：后台与公开端共用的图片版式
- src/main/resources/static/css/theme-tokens.css：主题 Token 的基础视觉实现
- src/main/resources/static/css/theme-pack.css：装饰、贴纸、分隔线、氛围与 Block 皮肤
- src/main/resources/static/css/themes/travel-classic.css：默认主题变量
- src/main/resources/static/assets/themes/stickers/：主题贴纸 SVG
- src/main/resources/static/vendor/：Vue、Vue Router、Element Plus、Axios、Leaflet

后台的 JS 与 CSS 拆成多个职责单一的文件，但都不走模块系统和打包：`js/admin/shared.js` 先建立 `window.AdminShared`，各页面把组件注册到 `window.AdminPages`，`admin-app.js` 最后取用。CSS 的引入顺序即层叠顺序，`admin/index.html` 里不能随意调换。

前端依赖全部放在 `static/vendor/` 下随 Jar 发布，不再引用 CDN。除了离线可用之外，这也让 Service Worker 能把它们缓存进应用外壳。主题颜色、字体、圆角和阴影均通过 CSS 变量控制。

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

仓库以 Gitee 为代码与构建来源，`.drone.yml` 由 Gitee 的 push 事件触发。流水线先并行执行 Maven（包含真实 PostgreSQL Flyway 迁移）和前端 JavaScript 检查，再启动打包后的应用运行 iPhone 13 Playwright smoke；全部通过后才连接服务器。远端也从 Gitee 获取代码，并按本次 `DRONE_COMMIT_SHA` 精确部署，避免构建期间 master 前移导致版本错配。

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

## 测试

当前自动化测试覆盖：

- Slug 处理
- 登录失败限流
- 生产环境初始管理员强密码约束
- 旅行日期校验
- 预算汇总和超支判断
- 日记草稿与发布的两套校验（草稿允许空标题空正文，发布严格）
- 空草稿的判空与延迟回收、自动 slug 生成
- Blocks JSON 协议、扩展区块与图片外观设置校验
- 主题 Token 白名单与危险颜色值校验
- 主题贴纸的位置与素材名白名单（路径穿越、像素坐标都会被丢弃）
- 主题互动只收枚举，脚本类取值退回默认或被剔除
- 全站主题的 AUTO / FIXED 模式切换
- 图片上传处理
- 随手记客户端幂等与当地日期换算
- 空 PostgreSQL 的 Flyway 迁移（本机有 Docker 时运行；Drone 使用流水线 PostgreSQL 服务强制执行）

前端 JavaScript 可使用 Node.js 做统一语法检查，但运行项目不依赖 Node.js：

~~~bash
npm run check:js
~~~

移动端布局还有一套 Playwright 端到端测试，覆盖 iPhone 13、Pixel 7 和桌面 Chrome。完整套件是开发依赖，**不参与 Maven 打包和 Docker 镜像构建**；Drone 只在部署前运行标记为 `@smoke` 的 4 条关键路径。日常运行项目仍然不需要 Node.js。完整测试需要一个已经跑起来的应用实例：

~~~bash
npm install && npx playwright install chromium
E2E_BASE_URL=http://localhost:8080 E2E_ADMIN_USER=admin E2E_ADMIN_PASS=你的密码 npx playwright test
~~~

用例位于 `e2e/`：除独立日记新建、旅行日记兼容、连续写作、刷新恢复、发布和手机端布局外，还覆盖快捷组件弹出软键盘后的光标可见性、图片设置四个 Tab 的底部可达性、下拉关闭后的滚动复位、工作台无横向溢出、预算全部保存，以及“白天整理、晚上追加”仍写入同一篇日记。

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
├── moment            随手记、整理成日记、当天路线、AI 润色
├── publicapi
├── theme
└── trip
~~~

日记区块协议、图片设置语义和扩展约定见 [docs/journal-editor.md](docs/journal-editor.md)。
