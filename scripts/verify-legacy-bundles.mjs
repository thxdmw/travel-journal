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
  draftKeys:
    'dropPendingMoment,dropPhoto,get,pendingMoment,pendingMoments,pendingPhotos,pointer,put,queueMoment,queuePhoto,remove,updatePendingMoment',
  draftStores: 'drafts,pending-moments,photos',
  mapKeys:
    'create,destroy,gcj02ToWgs84,manualProvider,providerUsable,resolveProvider,runtime,setManualProvider,wgs84ToGcj02',
  mediaKeys: 'MEDIA_SELECTOR,applyResponsiveImages,enhance,groupOf,teardown',
  mediaSelector: '.journal-figure img, .journal-gallery img, .journal-postcard img',
  routeKeys: 'STEP_MS,render,simpleMap',
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

// 真 Leaflet 会请求 OSM 瓦片；冒烟验证只关心地图适配层，不应依赖外网。
await page.route('https://**/*', route =>
  route.fulfill({ status: 204, contentType: 'image/png', body: '' }),
)

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

await page.route('**/api/public/trips', route =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      code: 'OK',
      message: 'success',
      requestId: 'verify-trips-sfc',
      data: [
        { id: 1, title: '京都之旅', slug: 'kyoto', summary: null, status: 'COMPLETED', startDate: '2026-04-01', endDate: '2026-04-05', cities: ['京都'], journalCount: 3, coverUrl: null },
        { id: 2, title: '冰岛环岛', slug: 'iceland', summary: '追着极光走', status: 'COMPLETED', startDate: '2025-10-01', endDate: '2025-10-08', cities: ['雷克雅未克'], journalCount: 5, coverUrl: null },
      ],
    }),
  }),
)

await page.goto(base + '/', { waitUntil: 'networkidle' })

/*
 * 多页构建与 PWA 升级链路。页面从 app-manifest.json 取产物版本注册 SW，
 * SW 再把这份清单中的所有 hash 产物预缓存；这里用真正的 Cache Storage
 * 验证整条链路，不只是检查文件存在。
 */
const pwa = await page.evaluate(async () => {
  const manifest = await fetch('/app-manifest.json', { cache: 'no-store' }).then(response => response.json())
  const registration = await navigator.serviceWorker.ready
  await new Promise(done => setTimeout(done, 100))
  const cacheName = 'tj-shell-' + manifest.version
  const cache = await caches.open(cacheName)
  const missing = []
  for (const asset of manifest.assets) {
    if (!(await cache.match(asset))) missing.push(asset)
  }
  return {
    version: manifest.version,
    assetCount: manifest.assets.length,
    scriptUrl: registration.active?.scriptURL ?? '',
    cacheExists: (await caches.keys()).includes(cacheName),
    missing,
  }
})

// 首个页面 SFC：通过真实客户端路由切换，确认旧 Vue Router 拿到 ESM 注册的组件。
await page.evaluate(() => { location.hash = '#/trips' })
await page.waitForSelector('.filter-row .chip')
await page.locator('.filter-row .chip').filter({ hasText: /^2025$/ }).click()
await page.waitForFunction(() => {
  const cards = [...document.querySelectorAll('.journal-card h3')]
  return cards.length === 1 && cards[0]?.textContent === '冰岛环岛'
})
const tripsPage = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('.filter-row .chip')]
  return {
    title: document.querySelector('.page-title h1')?.textContent,
    years: buttons.map(button => button.textContent?.trim()),
    visibleCards: [...document.querySelectorAll('.journal-card h3')].map(item => item.textContent),
    link: document.querySelector('.journal-card')?.getAttribute('href'),
  }
})

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

/*
 * 特效运行时。这一块 jsdom 验不了：canvas 拿不到 2d 上下文，MutationObserver
 * 驱动的「主题一变就重新同步」也要真实事件循环才跑得起来。
 */
const effects = await page.evaluate(async () => {
  const settle = () => new Promise(done => setTimeout(done, 60))
  document.body.innerHTML += '<footer></footer>'

  window.TravelTheme.apply(
    {
      themeKey: 'verify-winter',
      baseThemeKey: 'travel-classic',
      definitionJson: {
        effects: { particles: 'snow' },
        stickers: { density: 'light', items: [{ asset: 'winter-snowflake', area: 'footer' }] },
      },
    },
    { persist: false },
  )
  await settle()

  const layer = document.querySelector('.tj-effect-layer')
  const canvas = document.querySelector('.tj-particle-canvas')
  const sticker = document.querySelector('.tj-sticker')
  const on = {
    globalExists: typeof window.TravelThemeEffects === 'object',
    hasSync: typeof window.TravelThemeEffects?.sync === 'function',
    layerCreated: !!layer,
    canvasCreated: !!canvas,
    canvasSized: canvas ? canvas.width > 0 && canvas.height > 0 : false,
    stickerCreated: !!sticker,
    // 硬约束：贴纸必须是非 img，否则灯箱会把装饰当成正文照片收进去
    stickerIsNotImage: sticker ? sticker.tagName === 'SPAN' : false,
    stickerHasBackground: sticker ? sticker.style.backgroundImage.includes('winter-snowflake.svg') : false,
    stickerAnchored: !!document.querySelector('footer .tj-sticker'),
    noImagesInLayer: layer ? layer.querySelectorAll('img').length === 0 : false,
  }

  // 切回不带特效的主题，画布和贴纸都要收干净
  window.TravelTheme.apply('travel-classic', { persist: false })
  await settle()
  const off = {
    canvasRemoved: !document.querySelector('.tj-particle-canvas'),
    stickersRemoved: document.querySelectorAll('.tj-sticker').length === 0,
    anchorCleared: document.querySelectorAll('.tj-sticker-anchor').length === 0,
  }

  return { ...on, ...off }
})

/*
 * 地图适配层。这里用真正的 Leaflet 建一次图——jsdom 里那份是替身，验不出
 * 「容器已初始化」这类只有真库才会抛的错。高德不验：它要联网加载 SDK 和真 Key。
 */
const map = await page.evaluate(async () => {
  const api = window.TravelMap
  // 固定成 OSM，避开需要 Key 和外网的高德
  api.setManualProvider('OSM')

  const host = document.createElement('div')
  host.style.cssText = 'width:400px;height:300px'
  document.body.appendChild(host)

  const beijing = [39.9042, 116.4074]
  const instance = await api.create(host, { center: beijing, zoom: 8 })

  // 两种标记都建一遍：带自定义 HTML 的是业务实际用法，不带的走 Leaflet 默认图钉
  const marker = instance.addMarker(beijing, { popup: '天安门' })
  const htmlMarker = instance.addMarker(beijing, { html: '<i class="pin"></i>' })
  const position = marker.getPosition()
  instance.setRoute([beijing, [31.2304, 121.4737]], { color: '#123456' })

  // 同容器并发建图：真 Leaflet 会在这里抛「Map container already initialized」
  let concurrentError = null
  try {
    await Promise.all([api.create(host), api.create(host)])
  } catch (error) {
    concurrentError = error.message
  }

  const gcj = api.wgs84ToGcj02(beijing[0], beijing[1])
  const back = api.gcj02ToWgs84(gcj[0], gcj[1])

  const result = {
    globalExists: typeof api === 'object' && api !== null,
    keys: Object.keys(api).sort().join(','),
    provider: instance.provider,
    // Leaflet 真的往容器里塞了瓦片层
    tilesRendered: host.querySelectorAll('.leaflet-tile-pane').length > 0,
    zoomReadable: instance.getZoom() === 8,
    /*
     * 两种标记都建得出来、句柄可用。
     *
     * 不验 DOM 细节：默认图钉的渲染依赖 Icon.Default 的图片探测，headless 下
     * 不保证出图。真正要守的是「不带 html 的调用不再直接抛 createIcon of
     * undefined」——能执行到这一行就说明那条路通了。
     */
    bothMarkersUsable:
      Number.isFinite(marker.getPosition()[0]) && Number.isFinite(htmlMarker.getPosition()[0]),
    // OSM 不转坐标，marker 位置应当原样返回
    markerRoundTrip: Math.abs(position[0] - beijing[0]) < 1e-9,
    concurrentError,
    // 转换函数在真实环境里也是这套语义
    gcjShifted: Math.abs(gcj[0] - beijing[0]) > 1e-6,
    gcjRoundTrip: Math.abs(back[0] - beijing[0]) < 1e-4,
  }

  api.destroy(host)
  const afterDestroy = host.querySelectorAll('.leaflet-tile-pane').length
  host.remove()
  api.setManualProvider(null)
  return { ...result, destroyedCleanly: afterDestroy === 0 }
})

/*
 * 图片增强与灯箱分组。真实浏览器里才有布局和 matchMedia，jsdom 下 enhance 的
 * 一些分支走不到。
 */
const media = await page.evaluate(() => {
  const api = window.JournalMedia
  const host = document.createElement('div')
  host.className = 'journal-document'
  host.innerHTML = `
    <figure class="journal-figure"><img id="v-photo" src="/api/media/1/display"></figure>
    <img id="v-avatar" class="site-avatar" src="/api/media/2/display">
    <span class="tj-sticker" data-theme-decoration="sticker"></span>
    <figure class="journal-gallery journal-gallery--carousel">
      <img src="/api/media/3/display"><img src="/api/media/4/display"><img src="/api/media/5/display">
    </figure>`
  document.body.appendChild(host)

  api.enhance(host)
  const enhanced = {
    carouselBuilt: host.querySelectorAll('.journal-carousel__track img').length === 3,
    navBuilt: host.querySelectorAll('.journal-carousel__nav').length === 2,
    srcsetApplied: host.querySelector('#v-photo')?.getAttribute('srcset')?.includes('480w') === true,
  }

  // 重复增强不应越套越深
  api.enhance(host)
  const idempotent = host.querySelectorAll('.journal-carousel').length === 1

  // 灯箱分组：头像和贴纸都不能进正文照片组
  const photoGroup = api.groupOf(host.querySelector('#v-photo'))
  const avatarGroup = api.groupOf(host.querySelector('#v-avatar'))

  api.teardown(host)
  const restored = host.querySelectorAll('.journal-carousel').length === 0

  const result = {
    globalExists: typeof api === 'object' && api !== null,
    keys: Object.keys(api).sort().join(','),
    selector: api.MEDIA_SELECTOR,
    ...enhanced,
    idempotent,
    restored,
    // 正文里有 1 张单图 + 3 张组图，头像和贴纸都不算
    photoGroupSize: photoGroup.length,
    avatarExcluded: avatarGroup.length === 0,
  }
  host.remove()
  return result
})

/* 今日路线：在真实地图上画点、连线并跑一次回放。 */
const route = await page.evaluate(async () => {
  const api = window.DayRoute
  window.TravelMap.setManualProvider('OSM')

  const host = document.createElement('div')
  host.style.cssText = 'width:400px;height:300px'
  document.body.appendChild(host)
  const map = await window.TravelMap.create(host, { center: [30.9, 103.5], zoom: 8 })

  const points = [
    { order: 1, time: '09:30', title: '山门', latitude: 30.9, longitude: 103.5, photos: [] },
    { order: 2, time: '15:20', title: '古镇', latitude: 31.0, longitude: 103.6, photos: [] },
    // 没有坐标的点必须被丢掉，不能画到 (0,0) 去
    { order: 3, time: '18:00', title: '缺坐标', latitude: null, longitude: null, photos: [] },
  ]
  const controller = api.render(map, points, { source: 'moment' })

  const markerCount = host.querySelectorAll('.travel-map-marker').length
  controller.play()
  const playing = controller.playing
  controller.stop()
  const stopped = !controller.playing
  controller.destroy()

  const result = {
    globalExists: typeof api === 'object' && api !== null,
    keys: Object.keys(api).sort().join(','),
    // 三个点里只有两个有坐标
    markerCount,
    playing,
    stopped,
    lineRemoved: host.querySelectorAll('.leaflet-overlay-pane path').length === 0,
  }
  window.TravelMap.destroy(host)
  host.remove()
  window.TravelMap.setManualProvider(null)
  return result
})

// 正常路径不应留下任何 console error；下面故意造 500，先把这一刻的快照留住
const cleanRun = [...consoleErrors]

/*
 * 草稿仓库只在后台页面加载，所以单独开一页。
 *
 * 这里验的是 jsdom 到不了的地方：真实 IndexedDB 的事务与索引，以及照片 Blob
 * 原样往返。jsdom 的 Blob 不被 Node 的结构化克隆支持，单元测试里存回来是个空
 * 对象——「没有被转成 base64」这条只能在真浏览器里证。
 */
const adminPage = await browser.newPage()
await adminPage.route('**/api/**', route =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'OK', message: 'success', requestId: 'verify', data: null }),
  }),
)
await adminPage.goto(base + '/admin/index.html', { waitUntil: 'domcontentloaded' })
await adminPage.waitForFunction(() => typeof window.LocalDraft === 'object')

const draft = await adminPage.evaluate(async () => {
  const api = window.LocalDraft
  const bytes = '原始照片字节 with binary  ÿ'

  await api.put(4242, { title: '真机草稿', blocks: [1, 2, 3] })
  const stored = await api.get(4242)

  const blob = new Blob([bytes], { type: 'image/jpeg' })
  await api.queuePhoto(4242, 'verify-key', blob, 'DSC001.jpg')
  const photos = await api.pendingPhotos(4242)
  const restored = photos[0]?.blob

  await api.queueMoment({ clientId: 'verify-c1', tripId: 77, content: '离线记的' })
  const moment = await api.pendingMoment('verify-c1')

  // 直接开库检查结构，确认建的就是既有用户机器上那一套
  const db = await new Promise(done => {
    const request = indexedDB.open('travel-journal')
    request.onsuccess = () => done(request.result)
  })
  const schema = {
    version: db.version,
    stores: [...db.objectStoreNames].sort().join(','),
  }
  db.close()

  const result = {
    globalExists: typeof api === 'object' && api !== null,
    keys: Object.keys(api).sort().join(','),
    draftRoundTrip: JSON.stringify(stored?.form) === JSON.stringify({ title: '真机草稿', blocks: [1, 2, 3] }),
    pointerKept: api.pointer()?.journalId === 4242,
    photoQueued: photos.length === 1 && photos[0]?.name === 'DSC001.jpg',
    // 关键一条：存回来的仍是 Blob，且内容逐字节相同
    photoIsBlob: restored instanceof Blob,
    photoContentIntact: restored instanceof Blob ? (await restored.text()) === bytes : false,
    momentQueued: moment?.content === '离线记的' && moment?.state === 'pending',
    schemaVersion: schema.version,
    schemaStores: schema.stores,
  }

  // 收拾干净，别把验证数据留在浏览器 profile 里
  await api.remove(4242)
  await api.dropPhoto('verify-key')
  await api.dropPendingMoment('verify-c1')
  return result
})

await adminPage.close()

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
  ['Vite 产物清单带内容版本', /^[a-f0-9]{12}$/.test(pwa.version) && pwa.assetCount > 0],
  ['PWA 注册 URL 携带本次产物版本', pwa.scriptUrl.includes('build=' + pwa.version)],
  ['Service Worker 预缓存全部 hash 产物', pwa.cacheExists && pwa.missing.length === 0],
  ['Trips SFC 已挂载到旧公开端路由', tripsPage.title === '旅行' && tripsPage.link === '#/trips/iceland'],
  ['Trips SFC 在真浏览器按年份筛选', tripsPage.years.includes('2026') && tripsPage.years.includes('2025') && tripsPage.visibleCards.join(',') === '冰岛环岛'],
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

  ['TravelThemeEffects 全局契约已建立', effects.globalExists && effects.hasSync],
  ['视口特效层被创建', effects.layerCreated],
  ['粒子画布被创建并按视口定尺寸', effects.canvasCreated && effects.canvasSized],
  ['贴纸按主题生成', effects.stickerCreated && effects.stickerHasBackground],
  ['贴纸是非 img 元素', effects.stickerIsNotImage && effects.noImagesInLayer],
  ['锚定型贴纸挂到了内容宿主上', effects.stickerAnchored],
  ['切走主题后画布被移除', effects.canvasRemoved],
  ['切走主题后贴纸与锚点标记都清干净', effects.stickersRemoved && effects.anchorCleared],

  ['LocalDraft 全局契约已建立', draft.globalExists],
  ['LocalDraft 方法集与旧实现一致', draft.keys === EXPECTED.draftKeys],
  ['IndexedDB 版本与 store 与既有用户一致', draft.schemaVersion === 3 && draft.schemaStores === EXPECTED.draftStores],
  ['正文草稿往返无损', draft.draftRoundTrip],
  ['最近编辑指针被维护', draft.pointerKept],
  ['照片入队并按日记查得到', draft.photoQueued],
  ['照片存回来仍是 Blob，没被转成 base64', draft.photoIsBlob],
  ['照片内容逐字节完好', draft.photoContentIntact],
  ['离线随手记入队', draft.momentQueued],

  ['TravelMap 全局契约已建立', map.globalExists],
  ['TravelMap 方法集与旧实现一致', map.keys === EXPECTED.mapKeys],
  ['真实 Leaflet 建出 OSM 地图并渲染瓦片层', map.provider === 'OSM' && map.tilesRendered],
  ['地图选项生效', map.zoomReadable],
  ['带与不带自定义 HTML 的标记都建得出来', map.bothMarkersUsable],
  ['OSM 下标记位置原样往返', map.markerRoundTrip],
  ['同容器并发建图不抛容器已初始化', map.concurrentError === null],
  ['GCJ-02 转换在真实环境同样生效', map.gcjShifted && map.gcjRoundTrip],
  ['destroy 后容器被清空', map.destroyedCleanly],

  ['JournalMedia 全局契约已建立', media.globalExists],
  ['JournalMedia 方法集与旧实现一致', media.keys === EXPECTED.mediaKeys],
  ['灯箱选择器没有退回宽泛的 img', media.selector === EXPECTED.mediaSelector],
  ['轮播结构与翻页按钮生成', media.carouselBuilt && media.navBuilt],
  ['站内图片补上了 srcset', media.srcsetApplied],
  ['重复增强不会越套越深', media.idempotent],
  ['teardown 还原原始结构', media.restored],
  ['正文照片按整篇成组', media.photoGroupSize === 4],
  ['头像不进正文照片组', media.avatarExcluded],

  ['DayRoute 全局契约已建立', route.globalExists],
  ['DayRoute 方法集与旧实现一致', route.keys === EXPECTED.routeKeys],
  ['缺坐标的点被丢掉，没有画到 (0,0)', route.markerCount === 2],
  ['回放能开始也能停下', route.playing && route.stopped],
  ['destroy 清掉路线', route.lineRemoved],

  ['正常路径没有 console error', cleanRun.length === 0],
]

for (const [name, passed] of checks) console.log(`${passed ? '通过' : '失败'}  ${name}`)
if (cleanRun.length) console.log('console error：', cleanRun)

const failed = checks.filter(([, passed]) => !passed)
console.log(failed.length ? `\n${failed.length} 项未通过` : '\n全部通过')
process.exit(failed.length ? 1 : 0)
