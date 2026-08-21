# Travel Journal 项目上下文

单体旅行日记站：后端 Spring Boot，前端 Vue SFC 随 Jar 发布，公开端给读者看、后台给站主写。
开发规范见 [AGENTS.md](AGENTS.md)，对外介绍见 [README.md](README.md)。

> **本文件上限 6000 字符 / 120 行**（当前约 4600 / 100）。它每次开工都要被完整读一遍，超了就不划算。加新内容时同步删掉过时的——留下的必须是「不看就会犯错」或「不看就要翻半天代码」的东西，不是「知道了也不错」的背景介绍。细节展开放 `docs/`，这里只留结论和入口。

## 技术栈与硬约束

Java 21 · Spring Boot 3.5 · MyBatis-Plus · PostgreSQL + Flyway · MinIO · Spring Security Session
前端 `frontend/`：Vite + TypeScript + Vue 3 SFC · Vue Router · Element Plus · Axios · Leaflet

- **不引入** React 或大型状态管理，**不新增** CDN 依赖（依赖和静态资源一律本地托管）。
- 新代码一律 `frontend/src/` + ESM + TypeScript。不恢复 IIFE，不新增 `window.*` 业务全局，不用 `any` / `@ts-ignore`（ESLint 已设 error）。
- 不重构 Journal / Moment / Trip 核心领域模型，除非明确要求。
- 产物目录 `frontend/dist/`、`target/classes/static/` 均由构建生成、不进 Git；`src/main/resources/static/` 必须保持为空。

## 代码定位

| 任务 | 入口 |
| --- | --- |
| 后端模块 | `src/main/java/com/thx/traveljournal/<领域>/` |
| 配置 | `config/AppProperties.java`、`application.yml`、`.env.example` |
| 数据库迁移 | `src/main/resources/db/migration/` |
| 公开端 / 后台入口 | `frontend/src/entries/public.ts`、`entries/admin.ts` |
| 页面 | `frontend/src/public/pages/`、`frontend/src/admin/pages/` |
| API 客户端 / 类型 | `frontend/src/api/`（拦截器已解开 `ApiResponse.data`）、`src/types/` |
| 日记区块渲染 / 编辑 | `frontend/src/journal/`、`src/admin/JournalBlockEditor.vue` |
| 媒体与灯箱 | `frontend/src/media/` |
| 主题（应用 / 设计器 / 特效） | `frontend/src/theme/`、`admin/pages/ThemeStudioPage.vue`、`src/effects/` |
| 地图与路线 | `frontend/src/map/`、`src/route/`、后端 `map/service/MapLocationService.java` |
| 本机草稿与离线队列 | `frontend/src/draft/` |
| 样式 | `frontend/src/styles/`（引入顺序在各 `entries/*.ts`，顺序有意义） |
| E2E | `frontend/e2e/*.spec.ts` |

## 不可破坏的边界

**Journal 与媒体**

- `journal_entry.content_json` 的 Blocks JSON 是正文唯一数据源。不加 Markdown、不加任意 HTML、不做第二套预览正文。
- 灯箱只认 `.journal-figure img, .journal-gallery img, .journal-postcard img`，不要退回宽泛的 `querySelectorAll('img')`。
- 主题贴纸是装饰不是业务媒体：用 `.tj-sticker` 的非 `img` 元素配 CSS 背景。头像、Logo、地图图标都不得进入日记照片组。

**主题**

- 模型是 `effective = deepMerge(官方 definition, 用户稀疏 override)`。builtin 的 `definition_json` 不得被写回，改动只进 `override_json`；还原默认就是清空 override，不许在代码里重建官方 JSON。
- 设计器只有首页、日记、地图三个固定 Fixture，预览只挂 Showcase 路由，不混入真实业务数据。
- 不新增 Theme Token，除非明确要求。
- **左边配置、右边预览的界面一律整屏**（主题设计器、图片区块编辑器都是），PC 和手机都不用居中弹窗：那圈留白让出去的宽度，正是设置列和预览最缺的。
- **图片长什么样不归主题管**：宽度、相框、圆角、比例、图片组排版全部只在日记的图片设置弹窗里，主题侧对应的 token 已在 V30 删除。不要再往主题里加图片默认值——两套并存时「改了没反应」永远解释不清。

**地图与坐标**

- 业务页面统一走 `TravelMap`，不新增散落的 `L.map()` / `new AMap.Map()`。
- 展示 Provider 与搜索 Provider 是两回事。AUTO 按访客网络国家码选（CN → AMAP，其他 → OSM），**不是**按旅行地点、不用 GPS；用户手动选择优先，加载失败要提示、不许静默切换。
- 数据库坐标标准是 WGS84，对外数组统一 `[latitude, longitude]`；AMap 只在适配边界转 GCJ-02。历史坐标按 `coordinate_system` 读，**没有可靠来源时不要猜着批量转换**。

**写入语义**（最容易反复长出 bug）

MyBatis-Plus 的 `updateById` 默认跳过 null 字段，不确认这点，「删掉备注保存后又回来了」会一次次重现。

- PUT（完整提交）：**null = 清空**。真正可空的列标 `@TableField(updateStrategy = FieldStrategy.ALWAYS)`；必填列和外键不要标，否则会被写成 NULL。
- PATCH（局部更新）：**字段缺席 = 不改，字段存在且为 null = 清空**。按 JSON 字段是否出现来区分，别让 DTO 上的 null 兼指两种意思。前端也不要把空字符串转成 `undefined` 再发。
- 新增可空字段时补一条「设值 → 清空 → 重查仍为空」的回归测试。

**排序号**：新记录 `sort_order` 取 `MAX + 1`，**不要用现有条数**（删过中间一条就会撞车）；创建接口不接受前端传的 `sort_order`。

**数据库**：只新增 Flyway 版本文件，不改已执行过的迁移；表结构、实体、转换和测试同步改。MinIO 只存媒体对象。

## 验证

Docker 装在 WSL 里（Windows 侧没有 `docker` 命令），依赖容器先起着（PostgreSQL `5433`、MinIO `59000`）：

```bash
wsl -d Ubuntu -e bash -lc "cd /mnt/d/java/IdeaProjects/travel-journal && docker compose -f docker-compose.dev.yml up -d"
```

脚本本身要用 **Git Bash** 跑（JDK 21 它自己会找，本机默认那个是 8）：

```bash
./verify-ci.sh                 # 走完 CI 四步；也可只跑 frontend | backend | smoke | media
```

从 PowerShell 起就得指名道姓——`bash` 在 PowerShell 里解析到的是 `C:\Windows\System32\bash.exe`，那是 WSL 的 bash，而 node / java / mvn 全装在 Windows 侧：

```powershell
& "D:\Program Files\Git\bin\bash.exe" verify-ci.sh
```

只改前端时，`frontend/` 下这四条够快：`npm run lint`、`npm run typecheck`、`npm run test:unit`、`npm run build`。

## 易错点

- **`frontend/src/draft/schema.ts` 里每个字符串都对应用户机器上已有的数据**（库名、store、keyPath、索引、版本号、localStorage 键）。改一个字符就是一次没有提示的数据丢失；真要改结构必须写 `onupgradeneeded` 迁移分支并验证旧数据读得出来。
- **断言「今天」用 `SiteClock`，不要用 `LocalDate.now()`。** 开发机东八区、CI 容器 UTC，每天 16:00 UTC 之后差一天，只在傍晚以后红。
- **`FlywayMigrationTest` 没有 Docker 或 `FLYWAY_TEST_JDBC_URL` 时静默跳过**，那一整段断言等于没跑（`verify-ci.sh` 会拦下来）。
- **`iphone-13` 跑的是 WebKit**，本机没装会十条全红（`Executable doesn't exist`，不是产品问题）：`npx playwright install webkit`，或临时 `SMOKE_PROJECT=pixel-7`。
- **预览类界面的正文宽度必须等于 `--tj-article-width`**（默认 760px）：图片每一档宽度都相对它算，宽窄不对，同一张图在预览和发布后就是两个大小。`border-box` 下内边距和边框都要加回 `width`。
- **CSS 特异性相同时后写的赢。** `.a--full .x` 和 `.a .x` 特异性一样，覆盖那组必须排在后面。
- **别用 `transform` 缩放大块内容**：它交给合成器单独栅格化，比例一改整层缓存作废，手机 GPU 重画期间那层是空的——真机上「唰」地白一下，而桌面仿真永远复现不了。要缩就缩布局尺寸。
- **`sticky` 只在容器真能滚时才顶到边**，内容不够长时它待在正常流里，看着像「位置会变」。要真固定就放到滚动区外面。

## 专项文档

- [docs/journal-editor.md](docs/journal-editor.md)：区块协议、图片设置语义、编辑器设计决策与扩展方式。**改编辑器前必读。**
- [docs/ci-verification.md](docs/ci-verification.md)：CI 四步各在验证什么、手工复现命令、各 spec 分工。排查「本地绿 CI 红」时看。
- [docs/deployment.md](docs/deployment.md)：环境准备、配置项、本地运行、Docker 部署、迁移与备份。
