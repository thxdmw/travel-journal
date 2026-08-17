/*
 * Service Worker：让「添加到桌面」之后的远行手记在没信号时也能打开。
 *
 * 这个项目的离线诉求很具体——旅行中最常见的不是「离线读文章」，而是
 * 「在地铁里打开编辑器接着写」。所以缓存策略是按用途分的，不是一刀切：
 *
 *   应用外壳（HTML / CSS / JS）           stale-while-revalidate
 *       先用缓存里的那份秒开，同时在后台取新的，下次进来就是新版本。
 *       Vite 资源带内容 hash，所以拿到旧的一次不会出错。
 *
 *   图片（/api/media/…/display）          短新鲜期 + 条件校验
 *       内容不会变（改图会换 id），但权限会变——作者可能撤回发布。所以内容长期
 *       复用，权限每分钟回服务端确认一次，被拒时立刻删掉本地那一份。
 *
 *   其他 /api 请求                        完全不碰
 *       日记正文、旅行数据必须是最新的，宁可失败也不能给一份旧的——
 *       编辑器拿到旧正文再保存，等于把用户后写的内容覆盖掉。
 *       写请求（POST/PATCH/PUT/DELETE）更是一律直连。
 *
 * 草稿的离线能力不在这里，而在 IndexedDB（frontend/src/draft/）：
 * Service Worker 负责「打得开」，IndexedDB 负责「写得下、不丢」。
 */
// 页面会用 Vite 产物版本注册 `?build=` URL，每次产物变化都会触发 SW 升级。
const VERSION = new URL(self.location.href).searchParams.get('build') || 'v24';
const SHELL_CACHE = 'tj-shell-' + VERSION;
/*
 * 媒体缓存刻意不带构建版本。
 *
 * 图片内容不会变（换图会换 id），却因为缓存名里带着前端版本号，每发一次普通前端更新
 * 就被整个清空一次——旅行中攒下的几百张图要重新下一遍，而它们其实一张都没变。
 */
const MEDIA_CACHE = 'tj-media-v1';
/*
 * 首屏必须有的东西。装的时候就抓下来，第一次断网也能打开。
 *
 * 这里只能放「直接返回内容」的地址，不能放会 302 的：`/admin/` 在服务端会重定向到
 * `/admin/index.html`，而 cache.add 会跟随重定向并把最终响应存下来，那个响应带着
 * redirected 标记。导航请求的 redirect mode 是 manual，浏览器拒绝用一个 redirected
 * 响应去回应它——结果就是装了 Service Worker 之后 /admin/ 直接打不开。
 */
const SHELL_ASSETS = [
  '/',
  '/admin/index.html',
  '/theme-card-preview.html',
  '/manifest.json',
  '/app-manifest.json'
];

/**
 * app-manifest.json 由 frontend/scripts/publish-app.mjs 扫描完整部署目录生成，
 * 除了 hash 资源，也包含图标、贴纸和其他 public 原样资源；
 * 读取失败时仍能安装基础 shell，不让一个清单拖垮整次 PWA 升级。
 */
async function shellAssets() {
  try {
    const response = await fetch('/app-manifest.json', { cache: 'no-store' });
    if (!response.ok) return SHELL_ASSETS;
    const manifest = await response.json();
    // precache 是清单里剔掉大图之后的应用壳；老清单没有这个字段时退回 assets
    const generated = Array.isArray(manifest.precache) ? manifest.precache
      : (Array.isArray(manifest.assets) ? manifest.assets : []);
    return [...new Set([...SHELL_ASSETS, ...generated])];
  } catch {
    return SHELL_ASSETS;
  }
}
/** 图片缓存的条数上限。一次长途旅行可能有几百张，不封顶会把手机存储吃掉。 */
const MEDIA_LIMIT = 300;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE)
    .then(async cache => {
      const assets = await shellAssets();
      // 单个资源抓不到不该让整次安装失败，那样会一直装不上
      await Promise.allSettled(assets.map(url => cache.add(url)));
    })
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(names => Promise.all(names
      .filter(name => name.startsWith('tj-') && name !== SHELL_CACHE && name !== MEDIA_CACHE)
      .map(name => caches.delete(name))))
    .then(() => self.clients.claim()));
});

/** 缓存超量时按插入顺序丢掉最早的几条。 */
async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map(key => cache.delete(key)));
}

/**
 * 一个响应能不能拿来回应导航请求。
 *
 * redirected 的响应不行——导航请求的 redirect mode 是 manual，浏览器会把它当成
 * 网络错误。SHELL_ASSETS 里已经避开了会 302 的地址，这里再兜一层：服务端以后新增
 * 任何重定向，也不会因为被缓存过就让页面打不开。
 */
function usableFor(request, response) {
  return !!response && !(request.mode === 'navigate' && response.redirected);
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then(response => {
    // 只缓存实打实的 200，重定向结果不进缓存
    if (response && response.ok && !response.redirected) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  // 有缓存就先给缓存，网络请求继续在后台跑完并写回
  if (usableFor(request, cached)) return cached;
  const fresh = await network;
  if (fresh) return fresh;
  // 什么都没有时，导航请求至少给个能打开的壳
  if (request.mode === 'navigate') {
    const shell = await cache.match(request.url.includes('/admin') ? '/admin/index.html' : '/');
    if (usableFor(request, shell)) return shell;
  }
  return Response.error();
}

/**
 * 服务端说了不许存，就不存。
 *
 * 公开图片和草稿图片共用同一个 /api/media/ 地址，区别只在响应头里：非公开的那些
 * 带 Cache-Control: no-store。光靠 URL 形状分辨不出来，所以以服务端的判断为准。
 */
function storable(response) {
  const control = response.headers.get('Cache-Control') || '';
  return !/no-store/i.test(control);
}

/**
 * 缓存里这一份存了多久。
 *
 * 用响应自己的 Date 头，不另外维护一张时间表——多一份状态就多一处会不同步的地方。
 * 读不到就当它已经过期，宁可多校验一次。
 */
function cachedAgeMs(response) {
  const at = Date.parse(response.headers.get('Date') || '');
  return Number.isNaN(at) ? Infinity : Date.now() - at;
}

/**
 * 媒体缓存的新鲜期。
 *
 * 过了这段时间就必须回服务端问一次「现在还能看吗」。图片内容永远不变，所以这个窗口
 * 只影响权限的生效速度：作者撤回发布之后，最多这么久就再也拿不到了。
 */
const MEDIA_FRESH_MS = 60 * 1000;

/**
 * 图片：内容长期复用，权限每次校验。
 *
 * 曾经这里是纯 cache-first。图片内容不变，看起来很合理，但权限是会变的——一张已经
 * 公开并被缓存的照片，作者撤回发布之后，cache-first 仍然会把它拿出来，撤回等于没做。
 *
 * 所以拆成两件事：新鲜期内直接给缓存（省掉一次往返）；过期之后带上 If-None-Match
 * 回服务端，既走一遍权限判断，内容没变时对象存储也只回一个几百字节的 304。
 * 服务端明确拒绝时立刻把这一条删掉——之后连离线也拿不到它。
 */
async function media(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(request);
  if (cached && cachedAgeMs(cached) < MEDIA_FRESH_MS) return cached;

  const validators = {};
  const etag = cached && cached.headers.get('ETag');
  if (etag) validators['If-None-Match'] = etag;

  try {
    const response = await fetch(request, { headers: validators });
    // 撤回发布、删除图片、退出登录：一律立刻清掉本地那一份
    if (response.status === 403 || response.status === 404) {
      await cache.delete(request);
      return response;
    }
    // 内容没变，服务端也认了这次访问：继续用缓存里的那一份
    if (response.status === 304 && cached) return cached;
    if (response.ok && storable(response)) {
      await cache.put(request, response.clone());
      trim(MEDIA_CACHE, MEDIA_LIMIT);
    }
    return response;
  } catch (error) {
    // 断网了。旅途中翻看已经下载过的照片是主要场景，这时给缓存比给一个错误有用
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 构建清单决定下一个 SW 的注册 URL，必须每次直连网络。
  // 如果让旧 SW 用 stale-while-revalidate 回旧清单，页面会永远注册旧版本。
  if (url.pathname === '/app-manifest.json' || url.pathname === '/service-worker.js') return;

  if (url.pathname.startsWith('/api/media/')) {
    /*
     * 私有图片一律不进缓存，直连网络：
     *
     *   original     只有管理员能看的原图。存进缓存目录，等于把它留在了一台
     *                可能不只自己在用的设备上，而且删掉日记之后它还在。
     *   previewToken 草稿预览链接授权的图片。令牌会过期、会被作者撤销，
     *                缓存一份就等于把撤销这件事架空了。
     *
     * 草稿图片的 display/medium/thumbnail 从 URL 上和公开图片长得一模一样，这里
     * 拦不住。管理员在后台看过的草稿图曾经会被存进 Cache Storage，退出登录后
     * cache-first 直接命中，不再经过任何鉴权。所以真正的判断交给 cacheFirst，
     * 按服务端下发的 Cache-Control 决定存不存。
     */
    if (url.pathname.endsWith('/original') || url.searchParams.has('previewToken')) return;
    event.respondWith(media(request));
    return;
  }
  /*
   * 其余 /api 一律直连。
   *
   * 日记正文和旅行数据必须是最新的：编辑器拿到一份缓存的旧正文，作者在上面接着改，
   * 保存回去就等于把之前写的内容抹掉了。宁可这个请求失败——失败是看得见的，
   * 静默的数据回退不是。
   */
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(staleWhileRevalidate(request));
});

// 新版本部署后页面可以主动要求立刻接管，不用等所有标签页关掉
self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
