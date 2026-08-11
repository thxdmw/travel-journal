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
  const DISMISSED_KEY = 'travel-journal.offline-banner-dismissed';

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
      element.setAttribute('aria-live', 'polite');
      const text = document.createElement('span');
      text.textContent = '离线中 · 现在写的内容会先存在这台设备上，有网后自动同步';
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'tj-offline-banner__close';
      close.setAttribute('aria-label', '关闭离线提示');
      close.textContent = '×';
      close.addEventListener('click', () => {
        try { sessionStorage.setItem(DISMISSED_KEY, '1'); } catch (_) {}
        element.classList.remove('is-visible');
      });
      element.append(text, close);
      document.body.appendChild(element);
    }
    return element;
  }

  function sync() {
    if (!document.body) return;
    if (navigator.onLine) {
      try { sessionStorage.removeItem(DISMISSED_KEY); } catch (_) {}
      banner().classList.remove('is-visible');
      return;
    }
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(DISMISSED_KEY) === '1'; } catch (_) {}
    banner().classList.toggle('is-visible', !dismissed);
  }

  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
})();
