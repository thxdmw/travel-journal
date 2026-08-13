/*
 * API 客户端产物的冒烟验证，不需要后端。
 *
 * 迁移期最怕的是「产物构建出来了，但在真实浏览器里没建立起全局契约」——单元测试
 * 跑在 jsdom 上，验证不了 IIFE 的加载顺序、external axios 是否真的接上、旧脚本
 * 拿不拿得到 window.TravelApi。这里用静态服务器提供 static/，拦截 /api/** 返回
 * 固定 JSON，在真浏览器里把这几件事走一遍。
 *
 *   node scripts/verify-api-bundle.mjs
 *
 * 需要 Playwright 浏览器。缺自带 Chromium 时可以复用本机 Edge：
 *   $env:E2E_BROWSER_CHANNEL = 'msedge'
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { chromium } from 'playwright'

const ROOT = resolve('src/main/resources/static')
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

/** 旧 js/common/api.js 的分组规模。逐条比对由 frontend 的 vitest 契约用例负责。 */
const EXPECTED = { root: 'admin,auth,ensureCsrf,http,public', public: 11, auth: 8, admin: 80 }

const server = createServer(async (request, response) => {
  let path = decodeURIComponent(new URL(request.url, 'http://x').pathname)
  if (path === '/') path = '/index.html'
  if (path === '/admin/') path = '/admin/index.html'
  try {
    const file = join(ROOT, normalize(path))
    const body = await readFile(file)
    response.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' })
    response.end(body)
  } catch {
    response.writeHead(404).end('not found')
  }
})
await new Promise(done => server.listen(0, done))
const base = `http://127.0.0.1:${server.address().port}`

const channel = process.env.E2E_BROWSER_CHANNEL
const browser = await chromium.launch(channel ? { channel } : {})
const page = await browser.newPage()

const consoleErrors = []
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', error => consoleErrors.push('pageerror: ' + error.message))

// 首页会打 profile / home / map runtime，统一给一份字段够用的假数据
await page.route('**/api/**', route =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      code: 'OK',
      message: 'success',
      requestId: 'verify',
      data: {
        recentJournals: [],
        recentTrips: [],
        cityMarkers: [],
        tripCount: 0,
        cityCount: 0,
        journalCount: 0,
        photoCount: 0,
        displayName: '验证用户',
        avatarUrl: null,
        themeKey: null,
        theme: null,
      },
    }),
  }),
)

await page.goto(base + '/', { waitUntil: 'networkidle' })

const shape = await page.evaluate(() => ({
  exists: typeof window.TravelApi === 'object' && window.TravelApi !== null,
  root: Object.keys(window.TravelApi).sort().join(','),
  public: Object.keys(window.TravelApi.public).length,
  auth: Object.keys(window.TravelApi.auth).length,
  admin: Object.keys(window.TravelApi.admin).length,
}))

// 拦截器必须把 ApiResponse 外壳剥掉，业务代码拿到的是 data 本身
const unwrapped = await page.evaluate(async () => {
  const home = await window.TravelApi.public.home()
  return { hasBusinessField: 'tripCount' in home, envelopeStripped: !('data' in home) }
})

// 正常路径不应留下任何 console error；下面故意造 500，先把这一刻的快照留住
const cleanRun = [...consoleErrors]

await page.route('**/api/public/trips', route =>
  route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ message: '服务器开小差' }),
  }),
)
const failure = await page.evaluate(async () => {
  try {
    await window.TravelApi.public.trips()
    return { threw: false }
  } catch (error) {
    return { threw: true, message: error.message, status: error.status, network: error.network }
  }
})

await browser.close()
server.close()

const checks = [
  ['全局契约已建立', shape.exists],
  ['顶层 key 与旧 api.js 一致', shape.root === EXPECTED.root],
  ['public 分组条数一致', shape.public === EXPECTED.public],
  ['auth 分组条数一致', shape.auth === EXPECTED.auth],
  ['admin 分组条数一致', shape.admin === EXPECTED.admin],
  ['响应外壳被剥掉', unwrapped.hasBusinessField && unwrapped.envelopeStripped],
  ['失败被包成带 status/network 的 Error', failure.threw && failure.status === 500 && failure.network === false],
  ['服务端 message 透传给业务层', failure.message === '服务器开小差'],
  ['正常路径没有 console error', cleanRun.length === 0],
]

for (const [name, passed] of checks) console.log(`${passed ? '通过' : '失败'}  ${name}`)
if (cleanRun.length) console.log('console error：', cleanRun)

const failed = checks.filter(([, passed]) => !passed)
console.log(failed.length ? `\n${failed.length} 项未通过` : '\n全部通过')
process.exit(failed.length ? 1 : 0)
