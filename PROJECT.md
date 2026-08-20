# Travel Journal 项目地图

给 AI 代理和新接手的人用：这个项目长什么样、代码在哪、哪些线不能碰、怎么验证。
通用的工作规范在 [AGENTS.md](AGENTS.md)，面向使用者的介绍在 [README.md](README.md)，专题深挖在 `docs/`。

一句话：单体的旅行日记站，后端 Spring Boot，前端 Vue SFC 随 Jar 一起发布，公开端给读者看、后台给站主写。

## 技术栈与硬约束

- Java 21、Spring Boot 3.5、Maven、Spring Security Session、MyBatis-Plus。
- PostgreSQL + Flyway；媒体存 MinIO。
- 前端 `frontend/`：Vite + TypeScript + Vue 3 SFC，配 Vue Router、Element Plus、Axios、Leaflet，多页产物随 Jar 发布。
- **不引入** React 或大型状态管理；**不新增** CDN 依赖（依赖和静态资源一律本地托管）。
- 新代码一律写在 `frontend/src/`，用 ESM 和 TypeScript。不恢复 IIFE，不新增 `window.*` 业务全局，不用 `any` 和 `@ts-ignore`（ESLint 已设为 error）。
- 不重构 Journal / Moment / Trip 核心领域模型，除非明确要求。

## 代码快速定位

| 任务 | 首选入口 |
| --- | --- |
| 后端模块 | `src/main/java/com/thx/traveljournal/<领域>/` |
| 配置 | `config/AppProperties.java`、`src/main/resources/application.yml`、`.env.example` |
| 数据库迁移 | `src/main/resources/db/migration/` |
| 公开站点 | `frontend/src/entries/public.ts`、`frontend/src/public/`、`frontend/src/styles/public.css` |
| 后台入口 | `frontend/src/entries/admin.ts`、`frontend/src/admin/AdminAppShell.vue` |
| API 客户端 / 类型 | `frontend/src/api/`（拦截器已解开 `ApiResponse.data`）、`frontend/src/types/` |
| 日记 Block 渲染 | `frontend/src/journal/` |
| 日记 Block 编辑 | `frontend/src/admin/JournalBlockEditor.vue`、`pages/JournalEditorPage.vue` |
| 日记媒体 / 灯箱 | `frontend/src/media/`、`frontend/src/public/pages/JournalDetailPage.vue` |
| 主题（后端 / 设计器 / 特效） | `theme/ThemePresetService.java`、`frontend/src/admin/pages/ThemeStudioPage.vue`、`frontend/src/effects/` |
| 主题 token 应用 | `frontend/src/theme/` |
| 地图（适配层 / 路线 / 后端） | `frontend/src/map/`、`frontend/src/route/`、`map/service/MapLocationService.java` |
| 本机草稿与离线队列 | `frontend/src/draft/` |
| 样式 | `frontend/src/styles/`（引入顺序在各 `entries/*.ts` 里，顺序有意义） |
| E2E | `frontend/e2e/*.spec.ts`、`frontend/playwright.config.ts` |

产物目录：`frontend/dist/` 和 `target/classes/static/` 都是构建生成、不进 Git；`src/main/resources/static/` 必须保持为空。

## 不可破坏的领域边界

### Journal 与媒体

- `journal_entry.content_json` 的 Blocks JSON 是正文**唯一**数据源。不加 Markdown、不加任意 HTML、不做第二套预览正文。
- 灯箱只认 `MEDIA_SELECTOR`（`.journal-figure img, .journal-gallery img, .journal-postcard img`），不要退回宽泛的 `querySelectorAll('img')`。
- 主题贴纸是装饰不是业务媒体：用 `.tj-sticker` 的非 `img` 元素配 CSS `background-image`。头像、Logo、Hero、地图图标、UI 图标都不得进入日记照片组。

### 主题

- 模型是 `effective = deepMerge(官方 definition, 用户稀疏 override)`。builtin 的 `definition_json` 不得被用户编辑写回，改动只进 `override_json`；还原默认就是清空 override，不许在代码里人工重建官方 JSON。
- 后端 Schema 只管合法值、范围、fallback 和安全；Studio Metadata 管中文标签、帮助、预览场景。
- 设计器只有首页、日记、地图三个固定 Fixture，预览模式只挂 Showcase 路由，不混入真实业务数据。
- 不新增 Theme Token，除非明确要求。

### 地图与坐标

- 业务页面统一走 `TravelMap`，不新增散落的 `L.map()` 或 `new AMap.Map()`。
- 展示 Provider 和搜索 Provider 是两回事。AUTO 按访客网络国家码选：CN → AMAP，其他 → OSM，未知 → 配置的 fallback；**不是**按旅行地点，也不用 GPS。用户在 `localStorage` 的手动选择优先于 AUTO；加载失败要提示，不许静默永久切换。
- 数据库长期坐标标准是 WGS84，对外数组顺序统一 `[latitude, longitude]`。OSM 直接用 WGS84，AMap 只在适配边界转换 WGS84 ↔ GCJ-02。历史坐标按 `coordinate_system` 元数据读，没有可靠来源时**不要**猜着批量转换。
- 不建自托管瓦片、PMTiles、MapLibre。

### 写入语义（这一条最容易反复长出 bug）

MyBatis-Plus 的 `updateById` 默认跳过 null 字段——不确认这一点，「删掉备注保存后又回来了」会一次次重现。

- 完整提交（PUT）：**null 表示清空**。实体上真正可空的列标 `@TableField(updateStrategy = FieldStrategy.ALWAYS)`；必填列和外键不要标，否则会被写成 NULL。
- 局部更新（PATCH）：**字段缺席 = 不改，字段存在且为 null = 清空**。两者必须能区分，按 JSON 字段是否出现来判断，别让 DTO 上的 null 兼指两种意思。
- 前端不要把空字符串转成 `undefined` 再发——那会让「清空」在网络层就退化成「不改」。
- 新增可空字段时补一条「设值 → 清空 → 重新查询仍为空」的回归测试。

### 排序号

- 新记录的 `sort_order` 由后端取 `MAX(sort_order) + 1`，**不要用现有条数**：删过中间一条之后条数必然和最大序号撞车。
- 创建接口不接受前端传的 `sort_order`，只有 reorder 接口接受完整排序。

### 数据库

- 只新增 Flyway 版本文件，不改已经执行过的迁移。表结构、实体、服务转换和测试同步改。
- 涉及历史数据时优先加元数据并兼容读取，不做不可逆迁移。
- MinIO 只存媒体对象，不存地图瓦片或主题定义。

## 验证

依赖容器（PostgreSQL `5433`、MinIO `59000`，端口刻意避开 5432/9000）先起着。**这台机器的 Docker 装在 WSL 里，Windows 侧没有 `docker` 命令**：

```bash
wsl -d Ubuntu -e bash -lc "cd /mnt/d/java/IdeaProjects/travel-journal && docker compose -f docker-compose.dev.yml up -d"
```

然后一条命令走完 CI 的四步（`verify-frontend` / `verify-backend` / `verify-mobile-smoke` / `verify-media-integration`，不含部署）：

```bash
./verify-ci.sh              # 全套
./verify-ci.sh backend      # 只跑一步：frontend | backend | smoke | media
```

Java 需要 21，当前机器默认是 8，跑之前先切：

```bash
export JAVA_HOME=/d/java/environment/jdk21 && export PATH="$JAVA_HOME/bin:$PATH"
```

只改了前端时，`frontend/` 下这四条也够快：`npm run lint`、`npm run typecheck`、`npm run test:unit`、`npm run build`。

排查「本地绿、CI 红」和各 spec 的对应关系见 [docs/ci-verification.md](docs/ci-verification.md)。

## 本项目的易错点

踩过的坑，按「不看会重蹈覆辙」排序：

- **`frontend/src/draft/schema.ts` 里的每个字符串都对应用户机器上已有的数据。** 库名、store 名、keyPath、索引名、版本号、localStorage 的键，改一个字符就是一次没有提示的数据丢失。真要改结构必须写 `onupgradeneeded` 迁移分支并验证旧数据读得出来。
- **断言「今天」用 `SiteClock`，不要用 `LocalDate.now()`。** 开发机东八区、CI 容器 UTC，每天 16:00 UTC 之后差一天，写错只在傍晚以后红。涉及日期时跑一次 `mvn test -DargLine="-Duser.timezone=UTC"` 就能复现。
- **`FlywayMigrationTest` 没有 Docker 或没有 `FLYWAY_TEST_JDBC_URL` 时静默跳过**，那一整段 `information_schema` / `pg_constraint` 断言等于没跑。`verify-ci.sh` 会替你拦下来。
- **`iphone-13` 跑的是 WebKit**，本机没装会十条全红（报 `Executable doesn't exist`，不是产品问题）。`npx playwright install webkit` 装上，或临时 `SMOKE_PROJECT=pixel-7` 换 Chromium 内核的手机视口。
- **预览类界面的正文宽度必须等于 `--tj-article-width`**（默认 760px）。图片的每一档宽度都相对它计算，预览宽窄不对，同一张图在预览和发布后就是两个大小。`box-sizing` 是 `border-box`，内边距和边框都得加回 `width` 里。
- **CSS 特异性相同时，谁写在后面谁生效。** `.a--full .x` 和 `.a .x` 特异性一样，覆盖那组必须排在通用那组之后，否则会被静静地覆盖回去。
- **动画和滚动别用 `transform` 缩放大块内容。** 它会把那块交给合成器单独栅格化，比例一改整层缓存作废，手机 GPU 重画期间那层是空的——表现为真机上「唰」地白一下，而桌面仿真永远复现不了。要缩就缩布局尺寸（宽度）。
- **`sticky` 只在容器真的能滚时才把元素顶到边。** 内容不够长时它就待在正常流里，看起来像「位置会变」。要真固定就放到滚动区外面。

## 更多文档

- [docs/journal-editor.md](docs/journal-editor.md)：日记区块协议、图片设置语义、编辑器的设计决策和扩展方式。改编辑器前必读。
- [docs/ci-verification.md](docs/ci-verification.md)：CI 四步分别在验证什么、手工复现的完整命令、各 spec 的分工。
