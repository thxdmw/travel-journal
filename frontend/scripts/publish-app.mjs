/*
 * 把 Vite 多页产物回填到 Spring Boot 的 static/。
 *
 * dist/ 是临时目录；static/app-assets/ 和两份 HTML 是随 Jar 发布的产物。
 * 同时从 Vite manifest 生成 Service Worker 可直接读取的资源清单。
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(here, '..')
const dist = resolve(frontendRoot, 'dist')
const staticRoot = resolve(frontendRoot, '../src/main/resources/static')
const targetAssets = resolve(staticRoot, 'app-assets')

// 防止未来改路径时误删 static/ 或更广的目录。
if (!targetAssets.startsWith(staticRoot + sep) || targetAssets === staticRoot) {
  throw new Error(`拒绝清理非预期目录：${targetAssets}`)
}

const viteManifest = JSON.parse(await readFile(resolve(dist, '.vite/manifest.json'), 'utf8'))
const assets = new Set()
for (const entry of Object.values(viteManifest)) {
  if (entry.file) assets.add('/' + entry.file)
  for (const file of entry.css ?? []) assets.add('/' + file)
  for (const file of entry.assets ?? []) assets.add('/' + file)
}
const assetList = [...assets].sort()
const version = createHash('sha256').update(assetList.join('\n')).digest('hex').slice(0, 12)

await rm(targetAssets, { recursive: true, force: true })
await mkdir(targetAssets, { recursive: true })
await cp(resolve(dist, 'app-assets'), targetAssets, { recursive: true })
await cp(resolve(dist, 'index.html'), resolve(staticRoot, 'index.html'))
await cp(resolve(dist, 'admin/index.html'), resolve(staticRoot, 'admin/index.html'))
await cp(resolve(dist, 'theme-card-preview.html'), resolve(staticRoot, 'theme-card-preview.html'))
await writeFile(
  resolve(staticRoot, 'app-manifest.json'),
  JSON.stringify({ version, assets: assetList }, null, 2) + '\n',
  'utf8',
)

console.log(`已发布 ${assets.size} 个 Vite 产物到 Spring Boot 静态目录（${version}）`)
