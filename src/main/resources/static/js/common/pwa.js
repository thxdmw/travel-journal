/*
 * PWA 注册与离线提示。
 *
 * 两件事：把 Service Worker 装上，以及在断网时给一条明确的横幅——
 * 旅行中信号断断续续是常态，作者需要知道「现在写的东西存在哪」，
 * 而不是对着一个安静的页面猜。
 */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      // 注册失败不影响正常使用，只是没有离线能力；http 环境下本来就注册不了
    });
  });

  /** 断网横幅。挂在 body 上，不参与各页面的布局，也就不会把内容顶下去。 */
  function banner() {
    let element = document.querySelector('.tj-offline-banner');
    if (!element) {
      element = document.createElement('div');
      element.className = 'tj-offline-banner';
      element.setAttribute('role', 'status');
      element.textContent = '离线中 · 现在写的内容会先存在这台设备上，有网后自动同步';
      document.body.appendChild(element);
    }
    return element;
  }

  function sync() {
    if (!document.body) return;
    banner().classList.toggle('is-visible', !navigator.onLine);
  }

  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
})();
