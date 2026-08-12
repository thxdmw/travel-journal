/*
 * Service Worker：让「添加到桌面」之后的远行手记在没信号时也能打开。
 *
 * 这个项目的离线诉求很具体——旅行中最常见的不是「离线读文章」，而是
 * 「在地铁里打开编辑器接着写」。所以缓存策略是按用途分的，不是一刀切：
 *
 *   应用外壳（HTML / CSS / JS / vendor）  stale-while-revalidate
 *       先用缓存里的那份秒开，同时在后台取新的，下次进来就是新版本。
 *       前端资源都带 ?v= 版本号，所以拿到旧的一次不会出错。
 *
 *   图片（/api/media/…/display）          cache-first
 *       图片内容不会变（改图会换 id），拿到就一直有效。
 *
 *   其他 /api 请求                        完全不碰
 *       日记正文、旅行数据必须是最新的，宁可失败也不能给一份旧的——
 *       编辑器拿到旧正文再保存，等于把用户后写的内容覆盖掉。
 *       写请求（POST/PATCH/PUT/DELETE）更是一律直连。
 *
 * 草稿的离线能力不在这里，而在 IndexedDB（js/common/local-draft.js）：
 * Service Worker 负责「打得开」，IndexedDB 负责「写得下、不丢」。
 */
const VERSION = 'v16';
const SHELL_CACHE = 'tj-shell-' + VERSION;
const MEDIA_CACHE = 'tj-media-' + VERSION;
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
  '/vendor/vue/vue.global.prod.js',
  '/vendor/vue/vue-router.global.prod.js',
  '/vendor/axios/axios.min.js',
  '/vendor/element-plus/index.full.min.js',
  '/vendor/element-plus/index.css',
  '/vendor/element-plus/zh-cn.min.js',
  '/vendor/leaflet/leaflet.css',
  '/vendor/leaflet/leaflet.js',
  '/vendor/leaflet/images/layers.png',
  '/vendor/leaflet/images/layers-2x.png',
  '/vendor/leaflet/images/marker-icon.png',
  '/vendor/leaflet/images/marker-icon-2x.png',
  '/vendor/leaflet/images/marker-shadow.png',
  '/css/themes/travel-classic.css?v=7',
  '/css/public.css?v=19',
  '/css/theme-tokens.css?v=5',
  '/css/theme-pack.css?v=4',
  '/css/admin-shell.css?v=3',
  '/css/journal-editor.css?v=2',
  '/css/admin-workspace.css?v=10',
  '/css/journal-block-editor.css?v=3',
  '/css/journal-editor-mobile.css?v=4',
  '/css/journal-media.css?v=12',
  '/css/journal-blocks.css?v=4',
  '/css/moments.css?v=3',
  '/css/custom-cursor.css?v=6',
  '/js/common/theme.js?v=6',
  '/js/common/theme-effects.js?v=4',
  '/js/common/api.js?v=17',
  '/js/common/travel-map.js?v=6',
  '/js/common/local-draft.js?v=3',
  '/js/common/journal-media.js?v=9',
  '/js/common/journal-blocks.js?v=5',
  '/js/common/day-route.js?v=4',
  '/js/common/journal-block-editor.js?v=11',
  '/js/admin/shared.js?v=2',
  '/js/admin/trip-workspace.js?v=6',
  '/js/admin/journal-editor.js?v=4',
  '/js/admin/moments.js?v=5',
  '/js/admin/studio.js?v=8',
  '/js/admin-app.js?v=28',
  '/js/public-app.js?v=27',
  '/js/common/custom-cursor.js?v=6',
  '/js/common/pwa.js?v=2',
  '/img/home-hero-kyoto.png',
  '/img/app-icon.svg',
  '/assets/themes/stickers/classic-compass.svg',
  '/assets/themes/stickers/classic-pin.svg',
  '/assets/themes/stickers/classic-tag.svg',
  '/assets/themes/stickers/spring-bird.svg',
  '/assets/themes/stickers/spring-cloud.svg',
  '/assets/themes/stickers/spring-sakura.svg',
  '/assets/themes/stickers/spring-sprout.svg',
  '/assets/themes/stickers/summer-drink.svg',
  '/assets/themes/stickers/summer-sun.svg',
  '/assets/themes/stickers/summer-watermelon.svg',
  '/assets/themes/stickers/summer-wave.svg',
  '/assets/themes/stickers/autumn-coffee.svg',
  '/assets/themes/stickers/autumn-leaf.svg',
  '/assets/themes/stickers/autumn-maple.svg',
  '/assets/themes/stickers/autumn-ticket.svg',
  '/assets/themes/stickers/winter-cabin.svg',
  '/assets/themes/stickers/winter-mug.svg',
  '/assets/themes/stickers/winter-pine.svg',
  '/assets/themes/stickers/winter-snowflake.svg',
  '/assets/themes/stickers/retro-passport.svg',
  '/assets/themes/stickers/retro-plane.svg',
  '/assets/themes/stickers/retro-postmark.svg',
  '/assets/themes/stickers/retro-stamp.svg'
];
/** 图片缓存的条数上限。一次长途旅行可能有几百张，不封顶会把手机存储吃掉。 */
const MEDIA_LIMIT = 300;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE)
    // 单个资源抓不到不该让整次安装失败，那样会一直装不上
    .then(cache => Promise.allSettled(SHELL_ASSETS.map(url => cache.add(url))))
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

async function cacheFirst(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone());
    trim(MEDIA_CACHE, MEDIA_LIMIT);
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 图片内容不会变（换图会换 id），拿到就一直有效
  if (url.pathname.startsWith('/api/media/')) {
    event.respondWith(cacheFirst(request));
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
