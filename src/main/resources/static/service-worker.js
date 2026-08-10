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
const VERSION = 'v1';
const SHELL_CACHE = 'tj-shell-' + VERSION;
const MEDIA_CACHE = 'tj-media-' + VERSION;
/** 首屏必须有的东西。装的时候就抓下来，第一次断网也能打开。 */
const SHELL_ASSETS = [
  '/',
  '/admin/',
  '/manifest.json',
  '/vendor/vue/vue.global.prod.js',
  '/vendor/vue/vue-router.global.prod.js',
  '/vendor/axios/axios.min.js',
  '/vendor/element-plus/index.full.min.js',
  '/vendor/element-plus/index.css',
  '/vendor/element-plus/zh-cn.min.js'
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

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then(response => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  // 有缓存就先给缓存，网络请求继续在后台跑完并写回
  if (cached) return cached;
  const fresh = await network;
  if (fresh) return fresh;
  // 什么都没有时，导航请求至少给个能打开的壳
  if (request.mode === 'navigate') {
    const shell = await cache.match(request.url.includes('/admin') ? '/admin/' : '/');
    if (shell) return shell;
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
