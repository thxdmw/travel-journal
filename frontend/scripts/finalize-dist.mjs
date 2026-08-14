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
/*
 * 装 PWA 时该预先抓下来的东西。
 *
 * 以前是把整个部署目录都塞给 install，其中包括 2.7MB 的首页大图和 1.9MB 的主题预览图——
 * 用户点一下「添加到桌面」就得先下几兆用不上的图片，手机流量下尤其难受。应用壳
 * （HTML、带 hash 的 js/css、图标、字体）才是「离线也要打得开」真正需要的，
 * 图片按需在运行时缓存就够。
 */
const PRECACHE_SKIP = /\.(png|jpe?g|webp|gif|avif|mp4|webm)$/i
const precacheList = assetList.filter(asset => !PRECACHE_SKIP.test(asset))

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

console.log(`已整理 ${assetList.length} 个可部署文件，其中 ${precacheList.length} 个进入 PWA 预缓存（${version}）`)
