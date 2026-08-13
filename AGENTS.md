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
- 前端是随 Jar 发布的 Vue 3 浏览器全局版，使用 Vue Router、Element Plus、Axios、Leaflet 本地资源。
- 前端正在向 `frontend/`（Vite + TypeScript）渐进迁移，两套架构暂时共存，详见「前端迁移状态」。
- 不要引入 React 或大型状态管理。生产构建（Maven / Docker）目前仍不依赖 npm。
- `static/js` 下尚未迁移的脚本继续使用 IIFE 和 `window.*` 命名空间，不要在那里写 `import`；
  新代码一律写在 `frontend/src/`，用 ESM 和 TypeScript。
- 依赖和静态资源原则上本地托管，不新增 CDN 依赖。
- 密钥只允许来自环境变量；不得提交数据库、MinIO、高德或 AI 的真实凭据。

## 代码快速定位

| 任务 | 首选入口 |
| --- | --- |
| 后端模块 | `src/main/java/com/thx/traveljournal/<领域>/` |
| 配置 | `config/AppProperties.java`、`src/main/resources/application.yml`、`.env.example` |
| 数据库迁移 | `src/main/resources/db/migration/` |
| 公开站点 | `static/js/public-app.js`、`static/css/public.css`、`static/index.html` |
| 后台入口 | `static/js/admin-app.js`、`static/js/admin/`、`static/css/admin-workspace.css` |
| API 客户端 | `frontend/src/api/`（TS，已迁移）；拦截器会解开 `ApiResponse.data` |
| API 类型 | `frontend/src/types/`，与后端 record / entity 对应 |
| 旧脚本兼容层 | `frontend/src/legacy/travel-api-global.ts`，重建 `window.TravelApi` |
| 日记 Block 渲染 | `common/journal-blocks.js` |
| 日记 Block 编辑 | `common/journal-block-editor.js`、`admin/journal-editor.js` |
| 日记媒体/灯箱 | `common/journal-media.js`、`public-app.js` |
| 主题后端 | `theme/ThemePresetService.java`、`AdminThemePresetController.java` |
| 主题设计器 | `admin/studio.js`、`theme.js`、`theme-effects.js`、`theme-*.css` |
| 地图适配层 | `common/travel-map.js`、`common/day-route.js` |
| 地图后端 | `map/controller/PublicMapController.java`、`map/service/MapLocationService.java` |
| E2E | `e2e/*.spec.ts`、`playwright.config.ts` |

Java 包根路径为 `src/main/java/com/thx/traveljournal/`；静态资源根路径为 `src/main/resources/static/`，上表省略了这些公共前缀。

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

## 数据库规则

- 只新增新的 Flyway 版本文件，不修改已经执行过的迁移。
- 表结构、实体、服务转换和测试必须同步修改。
- 涉及历史数据时优先增加元数据并兼容读取，不做不可逆迁移，除非任务明确要求且来源已核实。
- MinIO 只保存媒体对象，不保存地图瓦片或主题定义。

## 前端静态资源版本

- 修改被 HTML 引用的 JS/CSS 后，同步提高对应 `?v=`：公开端看 `static/index.html`，后台看 `static/admin/index.html`。
- 同步更新 `static/service-worker.js` 的同一资源地址，并提高其中的 `VERSION`，避免 PWA 继续使用旧缓存。
- 运行中的 Spring Boot 通常从 `target/classes/static` 提供资源。源码改完但页面仍旧时，先执行 `mvn process-resources`，不要误判为代码没有生效。
- `static/js/dist/` 是 `frontend/` 的构建产物，不要手改。改了 `frontend/src` 必须 `npm run build`（在 `frontend/` 下），产物和源码要一起提交。

## 前端迁移状态

前端正从「IIFE + `window.*` 全局」渐进迁移到 `frontend/`（Vite + TypeScript + SFC）。原则是每次只迁一块、旧页面无感知、随时可回滚。

已迁移：

| 模块 | 新位置 | 产物 |
| --- | --- | --- |
| API 客户端与领域类型 | `frontend/src/api/`、`frontend/src/types/` | `static/js/dist/travel-api.js` |

迁移期的机制：

- 产物由 `frontend/scripts/build-legacy-bundles.mjs` 构建成保持全局契约的 IIFE，旧脚本只换一行 `<script src>`。
- `frontend/src/legacy/travel-api-global.ts` 负责重建 `window.TravelApi`，每迁走一个旧脚本就删掉对应分支。
- 产物提交进 git，所以 Maven / Docker / Drone 无需改动。收尾阶段再把构建接进 CI。
- `axios`、`vue` 等仍由 `static/vendor/` 的全局版提供，构建时按 external 处理，不重复打包。

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

# 尚未迁移的浏览器脚本语法检查
npm run check:js

# 改动 frontend/ 时（在 frontend/ 目录下执行）
npm run lint
npm run typecheck
npm run test:unit
npm run build

# API 客户端产物的浏览器冒烟验证，不需要后端
npm run verify:api-bundle

# 检查空白错误
git diff --check
```

E2E 依赖已运行的 `http://localhost:8080`。本机缺 Playwright 自带浏览器时复用 Edge：

```powershell
$env:E2E_BROWSER_CHANNEL = 'msedge'
npx playwright test <相关-spec> --project=desktop-chrome --project=pixel-7
```

- 主题：`theme-preview-fixture.spec.ts`、`theme-designer-preview.spec.ts`。
- 贴纸/灯箱：`journal-sticker-lightbox.spec.ts`。
- 地图：`map-provider.spec.ts`。
- 编辑器/随手记：`journal-mobile.spec.ts`、`moment-compose.spec.ts`；真实登录用例需要 E2E 管理员环境变量。
- Flyway Testcontainers 测试需要 Docker；无 Docker 时会跳过，交付说明中必须明确写出，不能称为已完成真实迁移验证。

## 完成标准

- 行为改动必须补或更新相邻测试，先读已有测试，不另建重复测试体系。
- 至少通过相关 Java 测试、JS 语法检查和相关桌面/移动 E2E。
- 检查无 Provider、无数据、异步切页和移动端窄屏，不允许页面崩溃或遗留监听器。
- 最终说明只列实际完成、验证结果、环境限制和仍存在的风险；不要把未运行的检查写成已通过。
