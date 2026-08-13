/*
 * 迁移期的产物构建。
 *
 * 现在还不能直接出 SPA 入口：static/js 下的 IIFE 脚本按 <script> 顺序执行、彼此
 * 靠 window 全局衔接，一次性换成 ESM 会把加载顺序打乱。所以这一步的产物是
 * 「保持全局契约的 IIFE」——旧页面只是换掉一行 src，其余完全不动。
 *
 * 每个 bundle 单独构建：Rollup 的 iife 格式只支持单入口，多入口必须分次跑。
 *
 * 产物落在 static/js/dist/ 并提交进 git。这样 Maven、Docker、Drone 全都不用改，
 * 生产构建继续不依赖 npm。等页面本身也迁完，再一次性把构建接进 Maven。
 * TODO(迁移): 收尾阶段改为 CI 构建，届时把 dist/ 加回 .gitignore。
 */
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { build } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const outDir = resolve(root, '../src/main/resources/static/js/dist')

/**
 * 待构建的兼容 bundle。
 *
 * `globalName` 只是 Rollup 对 iife 的形式要求，真正建立全局的是入口文件里的
 * 副作用赋值；`extend: true` 保证它不会覆盖同名的既有全局。
 */
const bundles = [
  {
    entry: 'src/legacy/travel-api-global.ts',
    fileName: 'travel-api.js',
    globalName: 'TravelApiBundle',
    // axios 由页面上的 vendor/axios.min.js 提供，不重复打进产物
    external: { axios: 'axios' },
  },
]

for (const bundle of bundles) {
  await build({
    root,
    configFile: false,
    resolve: { alias: { '@': resolve(root, 'src') } },
    logLevel: 'warn',
    build: {
      outDir,
      // 多个 bundle 共用一个输出目录，清空会互相删掉对方的产物
      emptyOutDir: false,
      // 现有代码已经在用可选链，目标浏览器不需要更低
      target: 'es2020',
      sourcemap: false,
      lib: {
        entry: resolve(root, bundle.entry),
        formats: ['iife'],
        name: bundle.globalName,
        fileName: () => bundle.fileName,
      },
      rollupOptions: {
        external: Object.keys(bundle.external),
        output: { globals: bundle.external, extend: true },
      },
    },
  })
  console.log(`已构建 ${bundle.fileName}`)
}
