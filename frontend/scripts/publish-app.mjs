/*
 * 将 Vite 完整产物发布到 Spring Boot 的 static/。
 * static/ 是纯生成目录：候选目录校验通过后整体替换，绝不保留历史文件。
 */
import { cp, mkdir, readFile, rename, rm } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(here, '..')
const dist = resolve(frontendRoot, 'dist')
const staticRoot = resolve(frontendRoot, '../src/main/resources/static')
const resourcesRoot = resolve(frontendRoot, '../src/main/resources')
const stagingRoot = resolve(resourcesRoot, `.static-build-${process.pid}`)

// 删除目标必须是 resources/static 和它的同级候选目录，防止未来改路径时误删仓库。
if (dirname(staticRoot) !== resourcesRoot || !stagingRoot.startsWith(resourcesRoot + sep)) {
  throw new Error(`拒绝发布到非预期目录：${staticRoot}`)
}

const manifest = JSON.parse(await readFile(resolve(dist, 'app-manifest.json'), 'utf8'))
await Promise.all([
  readFile(resolve(dist, 'index.html')),
  readFile(resolve(dist, 'admin/index.html')),
  readFile(resolve(dist, 'theme-card-preview.html')),
  readFile(resolve(dist, 'service-worker.js')),
])

await rm(stagingRoot, { recursive: true, force: true })
await mkdir(stagingRoot, { recursive: true })
await cp(dist, stagingRoot, { recursive: true })

await rm(staticRoot, { recursive: true, force: true })
await rename(stagingRoot, staticRoot)

console.log(`已完整发布 ${manifest.assets.length} 个文件到 Spring Boot 静态目录（${manifest.version}）`)
