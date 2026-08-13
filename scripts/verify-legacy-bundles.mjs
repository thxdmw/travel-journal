/*
 * 迁移产物的冒烟验证，不需要后端。
 *
 * 迁移期最怕的是「产物构建出来了，但在真实浏览器里没建立起全局契约」——单元测试
 * 跑在 jsdom 上，验证不了 IIFE 的加载顺序、external 的全局依赖是否真的接上、
 * 尚未迁移的旧脚本拿不拿得到那些 window.* 对象。这里用静态服务器提供 static/，
 * 拦截 /api/** 返回固定 JSON，在真浏览器里把这几件事走一遍。
 *
 *   node scripts/verify-legacy-bundles.mjs
 *
 * 每迁移一个模块，就在下面补一组对应的断言。
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

/** 迁移前各全局对象的形状基线。逐条比对由 frontend 的 vitest 契约用例负责。 */
const EXPECTED = {
  root: 'admin,auth,ensureCsrf,http,public',
  public: 11,
  auth: 8,
  admin: 80,
  themeKeys: 'apply,current,mapTokens,normalize,stored,supportedBases',
  blockKeys: 'CATALOG,createBlock,emptyDocument,normalize,render,renderBlock,sampleDocument,textContent,wordCount',
  catalogSize: 29,
}

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

/*
 * 主题产物。这里验的是 jsdom 覆盖不到的那一半：主题在首屏同步铺开、真实 CSSOM
 * 把变量算了出来，以及尚未迁移的 theme-effects.js 仍能通过 current() 拿到贴纸配置。
 */
const theme = await page.evaluate(() => {
  const applied = window.TravelTheme.apply(
    {
      themeKey: 'verify-autumn',
      baseThemeKey: 'travel-classic',
      definitionJson: {
        colors: { accent: '#C97B3F', primary: '#264A3D' },
        map: { routeWidth: 5 },
        effects: { particles: 'leaves' },
        stickers: { density: 'light', items: [{ asset: 'autumn-leaf', area: 'footer' }] },
      },
    },
    { persist: false },
  )
  const root = document.documentElement
  const computed = getComputedStyle(root)
  return {
    globalExists: typeof window.TravelTheme === 'object' && window.TravelTheme !== null,
    keys: Object.keys(window.TravelTheme).sort().join(','),
    returnedKey: applied.themeKey,
    // 走真实 CSSOM，而不是读回自己刚写进 style 属性的字符串
    accent: computed.getPropertyValue('--tj-accent').trim(),
    dataParticles: root.dataset.effectsParticles,
    routeWidth: window.TravelTheme.mapTokens().width,
    routeColor: window.TravelTheme.mapTokens().color,
    // theme-effects.js 读的就是这一条，迁移后必须还在
    stickerAsset: window.TravelTheme.current()?.definitionJson?.stickers?.items?.[0]?.asset,
  }
})

// 切回内置主题必须把上一套的枚举清干净，否则会残留玻璃卡片、雪花特效之类
const switched = await page.evaluate(() => {
  window.TravelTheme.apply('travel-classic', { persist: false })
  const root = document.documentElement
  return {
    particlesCleared: root.dataset.effectsParticles === undefined,
    accentCleared: getComputedStyle(root).getPropertyValue('--tj-accent').trim() !== '#C97B3F',
  }
})

/*
 * Block 渲染产物。重点验的是转义边界：把负载塞进正文，看浏览器解析后有没有
 * 多出元素或事件属性——这是 jsdom 之外再走一遍真实解析器。
 */
const blocks = await page.evaluate(() => {
  const api = window.JournalBlocks
  const payload = '<img src=x onerror="window.__pwned=1">'
  const document_ = {
    schemaVersion: 1,
    blocks: [
      api.createBlock('paragraph', { text: payload }),
      api.createBlock('link-card', { url: 'javascript:window.__pwned=1', title: '点我' }),
      api.createBlock('heading', { text: '正常标题', level: 2 }),
    ],
  }
  const host = document.createElement('div')
  host.innerHTML = api.render(document_, [])
  document.body.appendChild(host)
  const result = {
    globalExists: typeof api === 'object' && api !== null,
    keys: Object.keys(api).sort().join(','),
    catalogSize: api.CATALOG.length,
    blockCount: host.querySelectorAll('.journal-block').length,
    injectedElements: host.querySelectorAll('img[onerror], script').length,
    // 负载原样留在文本里，说明是被当成内容渲染的
    payloadAsText: host.textContent.includes(payload),
    linkHref: host.querySelector('.journal-link-card')?.getAttribute('href'),
    headingLevel: host.querySelector('.journal-heading')?.tagName,
    wordCount: api.wordCount(document_),
    pwned: window.__pwned === 1,
  }
  host.remove()
  return result
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
  ['TravelApi 全局契约已建立', shape.exists],
  ['TravelApi 顶层 key 与旧 api.js 一致', shape.root === EXPECTED.root],
  ['TravelApi public 分组条数一致', shape.public === EXPECTED.public],
  ['TravelApi auth 分组条数一致', shape.auth === EXPECTED.auth],
  ['TravelApi admin 分组条数一致', shape.admin === EXPECTED.admin],
  ['响应外壳被剥掉', unwrapped.hasBusinessField && unwrapped.envelopeStripped],
  ['失败被包成带 status/network 的 Error', failure.threw && failure.status === 500 && failure.network === false],
  ['服务端 message 透传给业务层', failure.message === '服务器开小差'],

  ['TravelTheme 全局契约已建立', theme.globalExists],
  ['TravelTheme 方法集与旧 theme.js 一致', theme.keys === EXPECTED.themeKeys],
  ['apply 返回归一化后的主题', theme.returnedKey === 'verify-autumn'],
  ['颜色变量进了真实 CSSOM', theme.accent === '#C97B3F'],
  ['枚举 token 铺成 data-* 属性', theme.dataParticles === 'leaves'],
  ['mapTokens 读出路线宽度与颜色', theme.routeWidth === 5 && theme.routeColor === '#C97B3F'],
  ['current 仍供得出贴纸配置', theme.stickerAsset === 'autumn-leaf'],
  ['切主题后枚举与变量都被清干净', switched.particlesCleared && switched.accentCleared],

  ['JournalBlocks 全局契约已建立', blocks.globalExists],
  ['JournalBlocks 方法集与旧实现一致', blocks.keys === EXPECTED.blockKeys],
  ['Block 目录条数一致', blocks.catalogSize === EXPECTED.catalogSize],
  ['整篇正文渲染出全部 Block', blocks.blockCount === 3],
  ['注入负载没有变成元素', blocks.injectedElements === 0 && !blocks.pwned],
  ['注入负载被当作文本渲染', blocks.payloadAsText],
  ['javascript: 链接被白名单挡成 #', blocks.linkHref === '#'],
  ['标题层级按 level 输出', blocks.headingLevel === 'H2'],
  ['字数统计可用', blocks.wordCount > 0],

  ['正常路径没有 console error', cleanRun.length === 0],
]

for (const [name, passed] of checks) console.log(`${passed ? '通过' : '失败'}  ${name}`)
if (cleanRun.length) console.log('console error：', cleanRun)

const failed = checks.filter(([, passed]) => !passed)
console.log(failed.length ? `\n${failed.length} 项未通过` : '\n全部通过')
process.exit(failed.length ? 1 : 0)
