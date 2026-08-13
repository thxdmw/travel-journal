/*
 * 将 Vite 完整产物发布到 Spring Boot 的 static/。
 * static/ 是纯生成目录：候选目录校验通过后整体替换，绝不保留历史文件。
 */
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, relative, resolve, sep } from 'node:path'
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

async function files(root, current = root) {
  const result = []
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name)
    if (entry.isDirectory()) result.push(...await files(root, path))
    else result.push(path)
  }
  return result
}

await Promise.all([
  readFile(resolve(dist, 'index.html')),
  readFile(resolve(dist, 'admin/index.html')),
  readFile(resolve(dist, 'theme-card-preview.html')),
  readFile(resolve(dist, 'service-worker.js')),
])

await rm(stagingRoot, { recursive: true, force: true })
await mkdir(stagingRoot, { recursive: true })
await cp(dist, stagingRoot, { recursive: true })
await rm(resolve(stagingRoot, '.vite'), { recursive: true, force: true })

const deployedFiles = (await files(stagingRoot))
  .filter(file => file !== resolve(stagingRoot, 'app-manifest.json'))
  .sort()
const assetList = deployedFiles.map(file => '/' + relative(stagingRoot, file).split(sep).join('/'))
const hash = createHash('sha256')
for (let index = 0; index < deployedFiles.length; index += 1) {
  hash.update(assetList[index]).update('\0').update(await readFile(deployedFiles[index])).update('\0')
}
const version = hash.digest('hex').slice(0, 12)
await writeFile(
  resolve(stagingRoot, 'app-manifest.json'),
  JSON.stringify({ version, assets: assetList }, null, 2) + '\n',
  'utf8',
)

await rm(staticRoot, { recursive: true, force: true })
await rename(stagingRoot, staticRoot)

console.log(`已完整发布 ${assetList.length} 个文件到 Spring Boot 静态目录（${version}）`)
