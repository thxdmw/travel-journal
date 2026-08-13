(function () {
  const { createApp, ref, computed, onMounted, onBeforeUnmount, nextTick, watch } = Vue;
  const api = window.TravelApi.public;
  const isThemePreview = new URLSearchParams(location.search).has('theme-preview');
  const applyTheme = (theme,options) => window.TravelTheme.apply(theme,options);
  // Studio iframe 从纯净基础主题开始，绝不继承浏览器里真实站点上次保存的主题。
  let siteTheme = isThemePreview ? 'travel-classic' : window.TravelTheme.stored(), scopedTheme = null;
  function setSiteTheme(theme){siteTheme=theme;if(!scopedTheme)applyTheme(theme);}
  function setScopedTheme(theme){scopedTheme=theme;applyTheme(theme);}
  function clearScopedTheme(){scopedTheme=null;applyTheme(siteTheme);}
  applyTheme(siteTheme);

  /**
   * 由 /api/media/{id}/display 推出 srcset。
   *
   * 放在这里而不是写进模板：模板字符串是反引号包起来的，里面的正则字面量会被
   * JS 先做一次转义解析，`\/` 变成 `/`，`/\/display$/` 就成了行注释，
   * 整个模板从那里断掉。复杂表达式一律留在 JS 侧。
   */
  function coverSrcset(url) {
    if (!url) return null;
    const base = url.replace(/\/display$/, '');
    if (base === url) return null;          // 不是预期格式就不生成，交给 src 兜底
    return base + '/thumbnail 480w, ' + base + '/medium 768w, ' + url + ' 1280w';
  }

  const publicPages = document.getElementById('app')?.[Symbol.for('travel-journal.public-pages')];
  if (!publicPages?.JournalCard || !publicPages?.MapProviderSwitch || !publicPages?.Journals || !publicPages?.Trips || !publicPages?.YearReview || !publicPages?.createFootprintMapPage || !publicPages?.createHomePage || !publicPages?.createJournalDetailPage || !publicPages?.createPublicAppShell || !publicPages?.createThemePreviewScene || !publicPages?.createTripDetailPage) {
    throw new Error('公开站 SFC 页面注册不完整');
  }
  const JournalCard = publicPages.JournalCard;

  /**
   * 地图渲染的统一入口：内部走 TravelMap（AUTO/AMAP/OSM），不再直接碰 Leaflet 或高德 API。
   * provider 加载失败时不静默换下一个——显示提示，用户自己点「尝试 OSM/高德」才切换，
   * 不偷偷改动已经保存的手动选择。
   */
  async function createMap(element, markers, options = {}) {
    if (!element) return null;
    const settings = typeof options === 'boolean' ? { fit: options } : options;
    return renderMapInto(element, settings, markers || []);
  }

  async function renderMapInto(element, settings, markers, forcedProvider) {
    element.classList.remove('map-load-failed');
    element.querySelector('.map-load-message')?.remove();
    const resolved = forcedProvider ? { provider: forcedProvider } : await window.TravelMap.resolveProvider();
    let mapInstance;
    try {
      const mapTheme = window.TravelTheme?.mapTokens?.() || {};
      mapInstance = await window.TravelMap.create(element, { provider: resolved.provider, zoom: 3, style: mapTheme.style });
    } catch (_) {
      showMapLoadFailure(element, settings, markers, resolved.provider);
      return null;
    }
    const zoomHint = document.createElement('div');
    zoomHint.className = 'map-zoom-hint';
    zoomHint.textContent = '按住 Ctrl + 滚轮缩放地图';
    element.appendChild(zoomHint);
    const ctrlWheel = event => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      mapInstance.zoomBy(event.deltaY < 0 ? 1 : -1);
    };
    element.addEventListener('wheel', ctrlWheel, { passive: false });

    const points = [];
    const safeMarkers = (markers || []).filter(marker => Number.isFinite(Number(marker.latitude)) && Number.isFinite(Number(marker.longitude)) && !(Number(marker.latitude) === 0 && Number(marker.longitude) === 0));
    safeMarkers.forEach((marker, index) => {
      const point = [Number(marker.latitude), Number(marker.longitude)];
      points.push(point);
      const html = settings.route
        ? '<span class="route-marker">' + (index + 1) + '</span>'
        : '<span class="city-marker"></span>';
      const iconAnchor = settings.route ? [14, 14] : [10, 10];
      mapInstance.addMarker(point, { html, iconAnchor, popup: createPopup(marker, index, settings.route) });
    });
    if (settings.route && points.length > 1) {
      const theme = window.TravelTheme?.mapTokens?.() || {};
      mapInstance.setRoute(points, { color: theme.color, width: theme.width, dashed: true, animate: !!theme.animateRoute });
    }
    if (settings.fit && points.length) mapInstance.fitBounds(points, { padding: [30, 30], maxZoom: settings.maxZoom || (settings.route ? 11 : 6) });
    requestAnimationFrame(() => mapInstance.invalidateSize());
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => mapInstance.invalidateSize());
      observer.observe(element);
      const originalDestroy = mapInstance.destroy.bind(mapInstance);
      mapInstance.destroy = () => { observer.disconnect(); element.removeEventListener('wheel', ctrlWheel); originalDestroy(); };
    }
    return mapInstance;
  }

  /** provider 加载失败时的提示：不静默换下一个，用户点了才重试另一个。 */
  function showMapLoadFailure(element, settings, markers, failedProvider) {
    if (!element) return;
    element.classList.add('map-load-failed');
    const box = document.createElement('div');
    box.className = 'map-load-message';
    const failedLabel = failedProvider === 'OSM' ? 'OSM' : '高德';
    const otherProvider = failedProvider === 'OSM' ? 'AMAP' : 'OSM';
    const otherLabel = otherProvider === 'OSM' ? 'OSM' : '高德';
    const text = document.createElement('p');
    text.textContent = failedLabel + '地图加载失败';
    box.appendChild(text);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'map-retry-btn';
    retry.textContent = '尝试' + otherLabel;
    retry.addEventListener('click', () => {
      element.classList.remove('map-load-failed');
      box.remove();
      renderMapInto(element, settings, markers, otherProvider);
    });
    box.appendChild(retry);
    element.appendChild(box);
  }

  function createPopup(marker, index, route) {
    const root = document.createElement('div');
    root.className = 'travel-map-popup';
    const title = document.createElement('strong');
    title.textContent = (route ? (index + 1) + '. ' : '') + [marker.cityName, marker.countryName].filter(Boolean).join(' · ');
    root.appendChild(title);
    if (marker.formattedAddress) {
      const address = document.createElement('p');
      address.textContent = marker.formattedAddress;
      root.appendChild(address);
    }
    const details = [];
    if (marker.arrivalDate) details.push(marker.arrivalDate + (marker.departureDate ? ' — ' + marker.departureDate : ''));
    if (marker.tripCount != null) details.push(marker.tripCount + ' 次旅行');
    if (marker.publishedJournalCount != null) details.push(marker.publishedJournalCount + ' 篇日记');
    if (details.length) {
      const meta = document.createElement('small');
      meta.textContent = details.join(' · ');
      root.appendChild(meta);
    }
    (marker.trips || []).slice(0, 3).forEach(item => root.appendChild(popupLink('旅行 · ' + item.title, '#/trips/' + encodeURIComponent(item.slug))));
    (marker.journals || []).slice(0, 4).forEach(item => root.appendChild(popupLink(item.title, '#/journals/' + encodeURIComponent(item.slug))));
    return root;
  }

  function popupLink(text, href) {
    const link = document.createElement('a');
    link.textContent = text;
    link.href = href;
    return link;
  }

  const MapProviderSwitch = publicPages.MapProviderSwitch;

  const Home = publicPages.createHomePage({
    mapProviderSwitch: MapProviderSwitch,
    createMap,
    destroyMap: element => window.TravelMap?.destroy(element)
  });

  const FootprintMap = publicPages.createFootprintMapPage({
    mapProviderSwitch: MapProviderSwitch,
    createMap,
    destroyMap: element => window.TravelMap?.destroy(element)
  });

  // 页面层渐进迁移桥：SFC 由 ESM 入口注册到 #app，不新增 window.* 全局。
  const Trips = publicPages.Trips;

  const TripDetail = publicPages.createTripDetailPage({
    mapProviderSwitch: MapProviderSwitch,
    createMap,
    destroyMap: element => window.TravelMap?.destroy(element),
    setScopedTheme,
    clearScopedTheme
  });

  const Journals = publicPages.Journals;

  const YearReview = publicPages.YearReview;

  const JournalDetail = publicPages.createJournalDetailPage({
    mapProviderSwitch: MapProviderSwitch,
    createMap,
    destroyMap: element => window.TravelMap?.destroy(element),
    setScopedTheme,
    clearScopedTheme
  });

  const ThemePreviewScene = publicPages.createThemePreviewScene({
    createMap: (element, options) => window.TravelMap.create(element, options),
    destroyMap: element => window.TravelMap?.destroy(element),
    mapTokens: () => window.TravelTheme?.mapTokens?.() || {}
  });

  // 预览模式只注册固定 Fixture 路由。这样旧入口 `/?theme-preview=1`、Studio 当前带 hash
  // 的入口，以及误带其它 hash 的入口都不可能落到真实 Home/Journal/Trip 组件，也就不会
  // 请求真实业务数据。普通站点仍使用原来的完整路由表。
  const routes = isThemePreview
    ? [{ path: '/:pathMatch(.*)*', component: ThemePreviewScene }]
    : [
        { path: '/', component: Home },
        { path: '/trips', component: Trips },
        { path: '/trips/:slug', component: TripDetail },
        { path: '/journals', component: Journals },
        { path: '/journals/:slug', component: JournalDetail },
        { path: '/preview/:token', component: JournalDetail, props: { preview: true } },
        { path: '/years', component: YearReview },
        { path: '/years/:year', component: YearReview },
        { path: '/map', component: FootprintMap }
      ];
  const router = VueRouter.createRouter({
    history: VueRouter.createWebHashHistory(),
    routes,
    scrollBehavior: () => ({ top: 0 })
  });

  const App = publicPages.createPublicAppShell({
    isThemePreview,
    currentPath: () => router.currentRoute.value.fullPath,
    setSiteTheme,
    applyTheme
  });

  createApp(App).use(router).component('JournalCard', JournalCard).mount('#app');
})();
