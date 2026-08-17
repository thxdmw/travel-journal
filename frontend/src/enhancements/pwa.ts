/*
 * PWA 注册与离线提示。
 *
 * 两件事：把 Service Worker 装上，以及在断网时给一条明确的横幅——
 * 旅行中信号断断续续是常态，作者需要知道「现在写的东西存在哪」，
 * 而不是对着一个安静的页面猜。
 */
interface AppManifest { version?: string }

export function installPwa(): void {
  if (!('serviceWorker' in navigator)) return;
  const DISMISSED_KEY = 'travel-journal.offline-banner-dismissed';

  async function workerUrl() {
    try {
      const response = await fetch('/app-manifest.json', { cache: 'no-store' });
      if (!response.ok) return '/service-worker.js';
      const manifest = await response.json() as AppManifest;
      return manifest.version
        ? '/service-worker.js?build=' + encodeURIComponent(manifest.version)
        : '/service-worker.js';
    } catch {
      return '/service-worker.js';
    }
  }

  /*
   * ============================================================ 版本更新
   *
   * 应用壳走 stale-while-revalidate：新版本部署后，第一次打开仍然用的是缓存里的旧
   * HTML，要等下一次进来才是新的。装到手机上之后这一点尤其容易让人困惑——改完部署，
   * 打开一看没生效，以为是没更新成功。
   *
   * 所以新版本装好后主动说一句，让作者自己决定什么时候切。不自动刷新：他可能正在
   * 编辑器里打字，页面一刷新，正在输入的那句话就断了（草稿在 IndexedDB 里不会丢，
   * 但打断本身就很糟）。
   */

  /** 有没有正在编辑、还没保存完的东西。有的话不打扰，等他自己点。 */
  function busyEditing() {
    return document.querySelector('.editor-save-state.is-saving, .editor-save-state.is-failed') !== null;
  }

  function updateBanner(onApply: () => void) {
    let element = document.querySelector<HTMLElement>('.tj-update-banner');
    if (element) return element;
    element = document.createElement('div');
    element.className = 'tj-offline-banner tj-update-banner';
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    const text = document.createElement('span');
    text.textContent = '有新版本可用';
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'tj-update-banner__apply';
    apply.textContent = '刷新';
    apply.addEventListener('click', onApply);
    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'tj-offline-banner__close';
    later.setAttribute('aria-label', '稍后再说');
    later.textContent = '×';
    later.addEventListener('click', () => element?.classList.remove('is-visible'));
    element.append(text, apply, later);
    document.body.appendChild(element);
    return element;
  }

  /**
   * 盯着这个注册项，等新的 Service Worker 装好。
   *
   * `waiting` 有值就说明新版本已经就绪、只是还没接管。注意不能只在 updatefound 时看：
   * 页面加载时可能已经有一个 waiting 的了（上次访问装好但没刷新）。
   */
  function watchForUpdate(registration: ServiceWorkerRegistration) {
    let reloading = false;
    const apply = () => {
      const next = registration.waiting;
      if (!next || reloading) return;
      reloading = true;
      // 让新 SW 立刻接管；controllerchange 之后再刷新，这样刷出来的一定是新版本
      next.postMessage('skip-waiting');
    };
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) window.location.reload();
    });

    const offer = () => {
      // 已经是由 SW 接管的页面才谈得上「更新」；首次安装不需要提示
      if (!registration.waiting || !navigator.serviceWorker.controller) return;
      if (busyEditing()) return;
      updateBanner(apply).classList.add('is-visible');
    };

    offer();
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed') offer();
      });
    });
  }

  function registerWorker() {
    workerUrl()
      .then(url => navigator.serviceWorker.register(url))
      .then(registration => watchForUpdate(registration))
      .catch(() => {
        // 注册失败不影响正常使用，只是没有离线能力；http 环境下本来就注册不了
      });
  }
  // ESM 入口会按需加载本脚本：既可能在 load 前，也可能在 load 后。
  if (document.readyState === 'complete') registerWorker();
  else window.addEventListener('load', registerWorker, { once: true });

  /** 断网横幅。挂在 body 上，不参与各页面的布局，也就不会把内容顶下去。 */
  function banner() {
    let element = document.querySelector<HTMLElement>('.tj-offline-banner');
    if (!element) {
      element = document.createElement('div');
      element.className = 'tj-offline-banner';
      element.setAttribute('role', 'status');
      element.setAttribute('aria-live', 'polite');
      const text = document.createElement('span');
      text.textContent = '离线中 · 现在写的内容会先存在这台设备上，有网后自动同步';
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'tj-offline-banner__close';
      close.setAttribute('aria-label', '关闭离线提示');
      close.textContent = '×';
      close.addEventListener('click', () => {
        try { sessionStorage.setItem(DISMISSED_KEY, '1'); } catch { /* 隐私模式可能禁用存储 */ }
        banner().classList.remove('is-visible');
      });
      element.append(text, close);
      document.body.appendChild(element);
    }
    return element;
  }

  function sync() {
    if (!document.body) return;
    if (navigator.onLine) {
      try { sessionStorage.removeItem(DISMISSED_KEY); } catch { /* 隐私模式可能禁用存储 */ }
      banner().classList.remove('is-visible');
      return;
    }
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(DISMISSED_KEY) === '1'; } catch { /* 隐私模式可能禁用存储 */ }
    banner().classList.toggle('is-visible', !dismissed);
  }

  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
}
