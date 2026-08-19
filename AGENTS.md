# Travel Journal 代理开发指南

本文件是后续开发的首选上下文。目标是减少重复扫描仓库和重复理解架构；只在任务需要时继续读取具体实现。README 用于产品说明，不要默认整篇重读。

## 交流与工作原则

- 始终使用简体中文分析、说明、注释和 Git 提交信息；代码标识符保持现有英文风格。
- 在现有单体架构上小步修改，优先复用已有服务和前端模块，不为“架构更漂亮”另建同类实现。
- 未经明确要求，不重构 Journal、Moment、Trip 核心领域模型，不扩展业务范围。
- 开始前先执行 `git status --short`，工作区可能已有用户改动；不得覆盖、回滚或格式化无关文件。
- 定位代码优先使用 `rg` 和直接相关文件。不要扫描 `node_modules/`、`target/`、`playwright-report/`、`test-results/`。
- 修改文件使用补丁方式；不要顺手升级依赖、引入框架或批量改换行符。

## 技术栈与硬约束

- Java 21、Spring Boot 3.5、Maven、Spring Security Session、MyBatis-Plus。
- PostgreSQL + Flyway；媒体使用 MinIO。
- 前端是随 Jar 发布的 Vue 3 + TypeScript SFC，使用 Vue Router、Element Plus、Axios、Leaflet npm 依赖。
- 前端已统一为 `frontend/` 下的 Vite + TypeScript + Vue SFC，多页产物随 Jar 发布。
- 不要引入 React 或大型状态管理。Docker 与 Drone 必须先构建前端，再打包 Jar。
- 新代码一律写在 `frontend/src/`，用 ESM 和 TypeScript；不要恢复 IIFE 或 `window.*` 业务全局。
- 依赖和静态资源原则上本地托管，不新增 CDN 依赖。
- 密钥只允许来自环境变量；不得提交数据库、MinIO、高德或 AI 的真实凭据。

## 代码快速定位

| 任务 | 首选入口 |
| --- | --- |
| 后端模块 | `src/main/java/com/thx/traveljournal/<领域>/` |
| 配置 | `config/AppProperties.java`、`src/main/resources/application.yml`、`.env.example` |
| 数据库迁移 | `src/main/resources/db/migration/` |
| 公开站点 | `frontend/index.html`、`frontend/src/entries/public.ts`、`frontend/src/public/`、`frontend/src/styles/public.css` |
| 后台入口 | `frontend/admin/index.html`、`frontend/src/entries/admin.ts`、`frontend/src/admin/AdminAppShell.vue` |
| API 客户端 | `frontend/src/api/`（TS，已迁移）；拦截器会解开 `ApiResponse.data` |
| API 类型 | `frontend/src/types/`，与后端 record / entity 对应 |
| 日记 Block 渲染 | `frontend/src/journal/`（TS，已迁移） |
| 日记 Block 编辑 | `frontend/src/admin/JournalBlockEditor.vue`、`JournalEditorPage.vue` |
| 日记媒体/灯箱 | `frontend/src/media/`、`frontend/src/public/pages/JournalDetailPage.vue` |
| 主题后端 | `theme/ThemePresetService.java`、`AdminThemePresetController.java` |
| 主题设计器 | `frontend/src/admin/pages/ThemeStudioPage.vue`、`frontend/src/styles/theme-*.css` |
| 主题特效运行时 | `frontend/src/effects/`（TS，已迁移） |
| 本机草稿与离线队列 | `frontend/src/draft/`（TS，已迁移） |
| 主题 token 应用 | `frontend/src/theme/`（TS，已迁移） |
| 地图适配层 | `frontend/src/map/`、`frontend/src/route/`（TS，已迁移） |
| 地图后端 | `map/controller/PublicMapController.java`、`map/service/MapLocationService.java` |
| E2E | `frontend/e2e/*.spec.ts`、`frontend/playwright.config.ts` |

Java 包根路径为 `src/main/java/com/thx/traveljournal/`；前端稳定资源位于 `frontend/public/`，最终部署资源只在构建后的 `frontend/dist/` 与 `target/classes/static/` 中出现。

## 不可破坏的领域边界

### Journal 与媒体

- `journal_entry.content_json` 的 Blocks JSON 是正文唯一数据源；不要增加 Markdown、任意 HTML或第二套预览正文。
- 主题贴纸是装饰，不是业务媒体：必须使用 `.tj-sticker` 的非 `img` 元素和 CSS `background-image`。
- 灯箱只认 `JournalMedia.MEDIA_SELECTOR`：`.journal-figure img, .journal-gallery img, .journal-postcard img`。禁止重新退回宽泛的 `querySelectorAll('img')`。
- 头像、Logo、Hero、地图图标、UI 图标和主题装饰不得进入日记照片组。

### 主题

- 系统主题模型为：`effective = deepMerge(official definition, sparse user override)`。
- builtin 的 `definition_json` 是官方默认，不得被用户编辑写回；用户改动只保存到 `override_json`。
- 还原默认必须清空 override，不得在代码里人工重建官方 JSON。
- 后端 Theme Schema 只负责合法值、范围、fallback 和安全；Studio Metadata 负责中文标签、帮助、预览场景、目标和生效条件。
- 设计器只有首页、日记、地图三个固定 Fixture。预览模式必须只挂载 Showcase 路由，不得请求或混入真实业务数据。
- 不新增 Theme Token，除非用户明确要求。

### 地图与坐标

- 展示 Provider 与地点搜索 Provider 是两个概念：国内搜索可继续使用高德，地图展示由 TravelMap 决定。
- 业务页面统一调用 `TravelMap`，不要新增散落的 `L.map()` 或 `new AMap.Map()`。
- AUTO 按访客网络国家码选择：CN → AMAP，其他国家 → OSM，未知 → 配置的 fallback；不是按旅行地点，也不用 GPS。
- 用户 `localStorage` 手动选择优先于 AUTO；Provider 加载失败必须提示，不得静默永久切换。
- AMAP 使用官方 JS API 2.0；OSM 使用现有 Leaflet。禁止恢复旧高德 Raster Tile。
- 不建设自托管瓦片、PMTiles、MapLibre 或 MinIO 地图存储。
- 数据库长期坐标标准是 WGS84，对外数组顺序统一为 `[latitude, longitude]`。
- OSM 直接使用 WGS84；AMap 只在适配边界转换 WGS84 ↔ GCJ-02。
- 历史坐标按 `coordinate_system` 元数据读取。没有可靠来源时禁止猜测并批量转换。

### 写入语义

- 清空字段必须真的能清空。MyBatis-Plus 的 `updateById` 默认跳过 null 字段，写 CRUD 时不确认这一点，「删掉备注保存后又回来了」这类 bug 会一次次重新长出来。
- 完整表单提交（PUT）：**null 表示清空**。实体上真正可空的列一律标 `@TableField(updateStrategy = FieldStrategy.ALWAYS)`；必填列和外键不要标，否则会把它们写成 NULL。
- 局部更新（PATCH）：**字段缺席 = 不修改，字段存在且为 null = 清空**。两者必须能区分，参考 Journal 草稿的做法按 JSON 字段是否出现来判断，不要用 DTO 上的 null 兼指两种意思。
- 前端不要把空字符串转成 `undefined` 再发出去——那会让「清空」在网络层就退化成「不改」。
- 新增可空字段时，同时补一条「设值 → 清空 → 重新查询仍为空」的回归测试。

### 排序号

- 新建记录的 `sort_order` 由后端分配，取 `MAX(sort_order) + 1`，不要用现有条数：删过中间一条之后条数必然和最大序号撞车。
- 创建接口不接受前端传来的 `sort_order`；只有 reorder 接口才真正接受完整排序。

## 数据库规则

- 只新增新的 Flyway 版本文件，不修改已经执行过的迁移。
- 表结构、实体、服务转换和测试必须同步修改。
- 涉及历史数据时优先增加元数据并兼容读取，不做不可逆迁移，除非任务明确要求且来源已核实。
- MinIO 只保存媒体对象，不保存地图瓦片或主题定义。

## 前端构建产物

- `frontend/` 是唯一前端源码目录：业务代码在 `src/`，稳定 URL 的原样资源在 `public/`。
- `src/main/resources/static/` 必须保持为空且已被 Git 忽略；禁止向这里添加源码或提交构建产物。
- `npm run build` / `npm run build:dist` 只生成可直接部署且被忽略的 `frontend/dist/`；Maven `process-resources` 会把它复制到 `target/classes/static/`。
- CSS、JS 和由模块引用的资源均由 Vite 生成内容 hash；`app-manifest.json` 根据整个部署目录的路径和内容生成版本，不再维护 `?v=`。
- 运行中的 Spring Boot 从 `target/classes/static` 提供资源。前端源码改完后先执行 `npm run build`，再执行 `mvn process-resources` 或重新打 Jar。
- Docker 和 Drone 都必须先构建前端再打包 Jar，避免把仓库中上一次提交的产物误当成当前构建结果。

## 前端迁移状态

前端已完成从 IIFE 与 `window.*` 全局到 Vite + TypeScript + SFC 的迁移。

已迁移：

| 模块 | 新位置 |
| --- | --- | --- |
| API 客户端与领域类型 | `frontend/src/api/`、`frontend/src/types/` |
| 主题 token 应用 | `frontend/src/theme/` |
| 日记 Block 目录与渲染 | `frontend/src/journal/` |
| 主题特效运行时 | `frontend/src/effects/` |
| 本机草稿仓库 | `frontend/src/draft/` |
| 地图 Provider 适配层 | `frontend/src/map/` |
| 日记媒体增强与灯箱分组 | `frontend/src/media/` |
| 今日路线与回放 | `frontend/src/route/` |

公开端与后台由 `frontend/src/entries/` 直接装配 TypeScript/SFC 页面、Vue Router 及各运行时，Journal Block 编辑器位于 `frontend/src/admin/JournalBlockEditor.vue`。Vite 以公开站、后台和主题卡片三份 HTML 为多页入口，hash 产物由 `app-manifest.json` 接入 Service Worker 缓存升级。迁移期兼容层、回滚产物和历史对拍夹具均已删除。

`frontend/src/draft/schema.ts` 里的每个字符串都对应用户机器上已有的数据。库名、store 名、keyPath、索引名、版本号、localStorage 的键，改一个字符就是一次没有提示的数据丢失。真要改结构必须写 `onupgradeneeded` 的迁移分支并验证旧数据读得出来。

前端构建机制：

- `frontend/vite.config.ts` 管理三个 HTML 入口；`finalize-dist.mjs` 生成完整部署目录与清单，Maven 再把 `frontend/dist/` 复制进最终 Jar。
- Vue、Vue Router、Axios、Element Plus、Leaflet 均由 npm 锁定并进入 Vite 模块图，不再使用浏览器全局 vendor。
- 构建产物不提交 Git。Docker 与 Drone 会先执行前端构建；本地首次运行也必须先生成 `frontend/dist/`。

写新前端代码时：一律放 `frontend/src/`，禁止新增 `window.*` 全局，禁止 `any` 和 `@ts-ignore`（ESLint 已设为 error）。

## 最小验证矩阵

先确认 `java -version` 为 21。当前 Windows 环境可用：

```powershell
$env:JAVA_HOME = 'D:\java\environment\jdk21'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
```

按改动范围执行：

```powershell
# Java 单测；交付前涉及后端时推荐 clean test
mvn -q test

# 改动 frontend/ 时（在 frontend/ 目录下执行）
npm run lint
npm run typecheck
npm run test:unit
npm run build

# ESM 产物与 PWA 的浏览器冒烟验证，不需要后端
npm run verify:build

# 检查空白错误
git diff --check
```

### 在本地复现 CI

一条命令走完 CI 的四个验证步骤（不含部署）：

```bash
./verify-ci.sh
```

也可以只跑其中一步：`./verify-ci.sh frontend | backend | smoke | media`。前置是依赖容器已经起着。
脚本会强制用 UTC 跑 Java 测试（对齐 CI 容器），并在迁移测试被跳过时直接失败——那种情况等于
这一段根本没验证。下面是它背后做的事，手工跑或排查时用得上。


Drone 跑的就是上面这些，外加两件事：真实的 PostgreSQL 迁移验证，和连着 MinIO 的图片链路 E2E。
这两件在本机默认都跑不了，也正是「本地绿、CI 红」的主要来源。依赖用 `docker-compose.dev.yml`
起（WSL 里的 Docker 就行，Windows 通过 localhost 直接连得到）：

```bash
docker compose -f docker-compose.dev.yml up -d
```

PostgreSQL 在 `5433`，MinIO 在 `59000`（控制台 `59001`）。端口刻意避开 5432/9000——这台机器上
它们往往已经被别的项目占着，而验证环境不该要求你先停掉别人的容器。

**1. 迁移验证。** 没有 `FLYWAY_TEST_JDBC_URL` 也没有 Docker 时 `FlywayMigrationTest` 会静默跳过，
迁移脚本和里面那些 `information_schema` / `pg_constraint` 断言就一次都没执行过：

```bash
FLYWAY_TEST_JDBC_URL=jdbc:postgresql://127.0.0.1:5433/travel_journal FLYWAY_TEST_DB_USERNAME=travel_journal FLYWAY_TEST_DB_PASSWORD=travel_journal mvn -q test -Dtest=FlywayMigrationTest
```

输出里确认它是 `Tests run: 1`；出现 `Skipped: 1` 就说明这一段根本没验证，不能写成「已完成迁移验证」。

**2. E2E。** 先打包并启动应用，指向上面那两个容器：

```bash
mvn -B -ntp -DskipTests package
```

```bash
DB_HOST=127.0.0.1 DB_PORT=5433 DB_NAME=travel_journal DB_USERNAME=travel_journal DB_PASSWORD=travel_journal DB_SSL_MODE=disable MINIO_ENDPOINT=http://127.0.0.1:59000 MINIO_ACCESS_KEY=dev-minio-access MINIO_SECRET_KEY=dev-minio-secret APP_ADMIN_USERNAME=admin APP_ADMIN_PASSWORD=dev-only-password-2026 APP_MAP_SEARCH_ENABLED=false APP_EMPTY_DRAFT_CLEANUP=false java -jar target/travel-journal.jar
```

再在 `frontend/` 下跑（`E2E_ADMIN_USER` / `E2E_ADMIN_PASS` 要和上面一致）：

```bash
npx playwright test --project=pixel-7 --grep @smoke
```

```bash
npx playwright test --project=desktop-chrome --grep @media
```

- `iphone-13` 用的是 WebKit，本机没装就会十条全红（报 `Executable doesn't exist`，不是产品问题）。
  跑 `npx playwright install webkit` 装上，或者用同为手机视口、基于 Chromium 的 `pixel-7`。
- `@media` 必须用 Chromium：它测的是 Service Worker 和 Cache Storage。
- 只跑 `--list` 也有用：整个用例集合不出来时（比如把只当类型用的导入写成了普通具名导入），
  `--grep` 会安静地筛出 0 条，CI 那一步等于没跑。
- 改完 UI 一定要真跑一遍 E2E。把下拉换成按钮这类改动，单测和 typecheck 都发现不了
  「测试还在点一个已经不存在的元素」。

E2E 依赖已运行的 `http://localhost:8080`。本机缺 Playwright 自带浏览器时复用 Edge：

```powershell
$env:E2E_BROWSER_CHANNEL = 'msedge'
npx playwright test <相关-spec> --project=desktop-chrome --project=pixel-7
```

- 主题：`theme-preview-fixture.spec.ts`、`theme-designer-preview.spec.ts`。
- 贴纸/灯箱：`journal-sticker-lightbox.spec.ts`。
- 地图：`map-provider.spec.ts`。
- 编辑器/随手记：`journal-mobile.spec.ts`、`moment-compose.spec.ts`；真实登录用例需要 E2E 管理员环境变量。
- 图片权限缓存：`media-cache-lifecycle.spec.ts`，标记 `@media`。需要连着真实 MinIO 的实例，用 Chromium 跑（`--project=desktop-chrome --grep @media`）；CI 里由 `verify-media-integration` 这一步执行，不在 `@smoke` 那批里。
- Flyway Testcontainers 测试需要 Docker；无 Docker 时会跳过，交付说明中必须明确写出，不能称为已完成真实迁移验证。
- 断言「今天」时用 `SiteClock`，不要用 `LocalDate.now()`：开发机在东八区，CI 容器跑在 UTC，每天 16:00 UTC 之后两者差一天，写错只会在傍晚以后红。改动涉及日期时顺手跑一次 `mvn test -DargLine="-Duser.timezone=UTC"` 就能复现这类问题。

## 完成标准

- 行为改动必须补或更新相邻测试，先读已有测试，不另建重复测试体系。
- 至少通过相关 Java 测试、JS 语法检查和相关桌面/移动 E2E。
- 检查无 Provider、无数据、异步切页和移动端窄屏，不允许页面崩溃或遗留监听器。
- 最终说明只列实际完成、验证结果、环境限制和仍存在的风险；不要把未运行的检查写成已通过。
