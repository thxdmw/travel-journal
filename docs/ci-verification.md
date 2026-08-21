# CI 验证与本地复现

排查「本地绿、CI 红」时看这份。日常只需要 `./verify-ci.sh`，命令和前置在 [PROJECT.md](../PROJECT.md#验证) 里。

## CI 在跑什么

`.drone.yml` 由 Gitee 推送触发，四个验证步骤串行，全过之后才是部署：

| 步骤 | 镜像 | 内容 |
| --- | --- | --- |
| `verify-frontend` | playwright | `npm ci` → lint → typecheck → 单测 → build → `verify:build` |
| `verify-backend` | maven + JDK 21 | `mvn package`，含连真实 PostgreSQL 的 Flyway 迁移验证 |
| `verify-mobile-smoke` | playwright | 起打包好的 Jar，跑 `iphone-13` 的 `@smoke` |
| `verify-media-integration` | playwright | 连着 MinIO 跑 `desktop-chrome` 的 `@media` |

`verify-ci.sh` 一一对应这四步，顺序和内容一致，只有两点刻意不同：

- Java 测试强制 `-Duser.timezone=UTC` 对齐 CI 容器——和「今天」有关的断言只在两边差一天时才露馅，宁可本地就红。
- 直接用现有 `node_modules` 而不是 `npm ci`，快得多，但锁文件本身的问题查不出来。要对齐就自己先跑一次 `npm ci`。

后两步在本机默认都跑不起来（要真实 PostgreSQL 和 MinIO），这正是「本地绿、CI 红」的主要来源。

## 两个 shell 别搞混

这台机器上工具链是分开装的，`verify-ci.sh` 跑在哪个 shell 里决定它能不能找到东西：

| | Git Bash（`D:\Program Files\Git\bin\bash.exe`） | WSL（`C:\Windows\System32\bash.exe`） |
| --- | --- | --- |
| node / npm / mvn / java | 有 | 没有 |
| docker | 没有 | 有 |

`verify-ci.sh` 要用 **Git Bash**，起容器的命令要进 **WSL**。坑在于 PowerShell 里敲 `bash` 拿到的是 WSL 那个，脚本进去以后一路 `command not found`；而 WSL 访问 `/mnt/d` 时路径看着和 Windows 侧一模一样，报错也不会提示你走错了门。脚本开头会检测并直接拦下来。

从 PowerShell 起要指名道姓（`./verify-ci.sh` 在 PowerShell 里则直接是语法错误）：

```powershell
& "D:\Program Files\Git\bin\bash.exe" verify-ci.sh
```

## JDK

项目是 Java 21，本机装了 8/17/19/21/22/25，`JAVA_HOME` 默认指向 **8**。用 8 编译会在 record 和 text block 处报一屏「需要 class, interface 或 enum」，而且位置全飘到无关文件上，看着像代码坏了——实际只是 JDK 不对。

`verify-ci.sh` 会自己找 21（依次看 `JAVA21_HOME`、`JAVA_HOME`、`/d/java/environment/jdk21` 等常见位置），找不到才报错。手工跑 `mvn` 时得自己带上：

```bash
JAVA_HOME=/d/java/environment/jdk21 mvn -o -ntp test
```

## 依赖容器

`docker-compose.dev.yml` 只起 PostgreSQL 和 MinIO，应用本身仍旧用 IDE 或 `mvn` 起在宿主机上。这台机器的 Docker 装在 WSL 里，Windows 侧没有 `docker` 命令，所以带 docker 的命令都要进 WSL；容器端口经 WSL 的 localhost 转发，Windows 这边的 Java 和 Playwright 直接连 `127.0.0.1` 就行，不需要知道 WSL 的 IP。

```bash
wsl -d Ubuntu -e bash -lc "cd /mnt/d/java/IdeaProjects/travel-journal && docker compose -f docker-compose.dev.yml up -d"
```

用完清掉容器和数据（`-v` 连卷一起删，dev 库里那些 E2E 造的数据就没了）：

```bash
wsl -d Ubuntu -e bash -lc "cd /mnt/d/java/IdeaProjects/travel-journal && docker compose -f docker-compose.dev.yml down -v"
```

已经在 WSL 的 shell 里时，前面那层 `wsl -d Ubuntu -e bash -lc` 去掉即可。PostgreSQL 在 `5433`，MinIO 在 `59000`（控制台 `59001`）——端口刻意避开 5432/9000，这台机器上它们往往已经被别的项目占着，而验证环境不该要求你先停掉别人的容器。

## 手工复现各步

### 迁移验证

没有 `FLYWAY_TEST_JDBC_URL` 也没有 Docker 时 `FlywayMigrationTest` 会**静默跳过**，迁移脚本和里面那些 `information_schema` / `pg_constraint` 断言就一次都没执行过：

```bash
FLYWAY_TEST_JDBC_URL=jdbc:postgresql://127.0.0.1:5433/travel_journal FLYWAY_TEST_DB_USERNAME=travel_journal FLYWAY_TEST_DB_PASSWORD=travel_journal mvn -q test -Dtest=FlywayMigrationTest
```

确认输出是 `Tests run: 1`；出现 `Skipped: 1` 就说明这一段根本没验证，不能写成「已完成迁移验证」。

注意 Testcontainers 那条路需要宿主机有 `docker` 命令，而这台机器上没有（Docker 在 WSL 里），所以必须走 `FLYWAY_TEST_JDBC_URL` 这条。

### E2E

先打包并启动应用，指向上面那两个容器：

```bash
mvn -B -ntp -DskipTests package
```

```bash
DB_HOST=127.0.0.1 DB_PORT=5433 DB_NAME=travel_journal DB_USERNAME=travel_journal DB_PASSWORD=travel_journal DB_SSL_MODE=disable MINIO_ENDPOINT=http://127.0.0.1:59000 MINIO_ACCESS_KEY=dev-minio-access MINIO_SECRET_KEY=dev-minio-secret APP_ADMIN_USERNAME=admin APP_ADMIN_PASSWORD=dev-only-password-2026 APP_MAP_SEARCH_ENABLED=false APP_EMPTY_DRAFT_CLEANUP=false java -jar target/travel-journal.jar
```

再在 `frontend/` 下跑（`E2E_ADMIN_USER` / `E2E_ADMIN_PASS` 要和上面一致）：

```bash
npx playwright test --project=iphone-13 --grep @smoke
npx playwright test --project=desktop-chrome --grep @media
```

## 容易踩的地方

- **`iphone-13` 用的是 WebKit**，本机没装就会十条全红（`Executable doesn't exist`，不是产品问题）。`npx playwright install webkit` 装上，或用同为手机视口、基于 Chromium 的 `pixel-7`。
- **`@media` 必须用 Chromium**：它测的是 Service Worker 和 Cache Storage。
- **`--grep` 筛出 0 条也是绿的。** 整个用例集合加载不出来时（比如把只当类型用的导入写成了普通具名导入），`--grep` 会安静地筛出 0 条，那一步等于没跑。`--list` 确认一下条数。
- **改完 UI 一定要真跑一遍 E2E。** 把下拉换成按钮、把滚动容器换一层，单测和 typecheck 都发现不了「测试还在操作一个已经不存在的元素」。
- 本机缺 Playwright 自带浏览器时可以复用 Edge：`E2E_BROWSER_CHANNEL=msedge`。

## 各 spec 的分工

| 范围 | 用例 |
| --- | --- |
| 编辑器、随手记 | `journal-mobile.spec.ts`、`moment-compose.spec.ts`、`journal-draft-creation.spec.ts` |
| 主题 | `theme-preview-fixture.spec.ts`、`theme-designer-preview.spec.ts` |
| 贴纸与灯箱隔离 | `journal-sticker-lightbox.spec.ts` |
| 地图 Provider | `map-provider.spec.ts` |
| 图片权限缓存（`@media`） | `media-cache-lifecycle.spec.ts` |

`@smoke` 那批（10 条）由 `verify-mobile-smoke` 跑；`@media` 单独一步，因为它需要 MinIO，而且要 Chromium 才能测 Cache Storage 和 SW。两步串行而不是并行——它们共用同一个 PostgreSQL，同时跑会互相看见对方的数据。

**没打标记的用例，`verify-ci.sh` 一条都不会跑到。** 每个 spec 里通常只有一条挂着 `@smoke`，剩下的要自己点名。改过主题设计器就手动跑一遍它那一整个文件（应用要先起着，见上面 E2E 那节）：

```bash
E2E_BASE_URL=http://127.0.0.1:8080 E2E_ADMIN_USER=admin E2E_ADMIN_PASS=dev-only-password-2026 npx playwright test theme-designer-preview --project=desktop-chrome
```
