/* 将 Vite dist 补全为可直接部署的静态目录，并生成 PWA 资源清单。 */
import { createHash } from 'node:crypto'
import { readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(here, '..')
const dist = resolve(frontendRoot, 'dist')

if (!dist.startsWith(frontendRoot + sep) || dirname(dist) !== frontendRoot) {
  throw new Error(`拒绝整理非预期目录：${dist}`)
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
await rm(resolve(dist, '.vite'), { recursive: true, force: true })

const deployedFiles = (await files(dist))
  .filter(file => file !== resolve(dist, 'app-manifest.json'))
  .sort()
const assetList = deployedFiles.map(file => '/' + relative(dist, file).split(sep).join('/'))
const hash = createHash('sha256')
for (let index = 0; index < deployedFiles.length; index += 1) {
  hash.update(assetList[index]).update('\0').update(await readFile(deployedFiles[index])).update('\0')
}
const version = hash.digest('hex').slice(0, 12)
await writeFile(
  resolve(dist, 'app-manifest.json'),
  JSON.stringify({ version, assets: assetList }, null, 2) + '\n',
  'utf8',
)

console.log(`已整理 ${assetList.length} 个可部署文件（${version}）`)
