/*
 * 地图 Provider 适配层。
 *
 * 业务代码不再直接碰 Leaflet 或高德 JS API，统一通过 TravelMap.create() 拿到一个
 * provider 无关的地图实例。内部按 ProviderResolver 解析出的结果分派到
 * AMapTravelMap（高德 JS API 2.0）或 LeafletTravelMap（现有 Leaflet + OSM 瓦片）。
 *
 * 对外契约永远是 WGS84 坐标、[latitude, longitude] 数组顺序——和现有业务代码
 * （day-route.js、public-app.js）已经在用的约定一致，迁移调用方时改动最小。
 * GCJ-02 转换只发生在 AMapTravelMap 内部：渲染前转成 GCJ-02，交互事件（点击、
 * 拖拽）回调前转回 WGS84，调用方永远不需要关心当前用的是哪套坐标系。
 *
 * 不做静默自动降级：provider 加载失败时 create() 会 reject，页面自己决定怎么提示
 * 用户、要不要换一个 provider 重试；不会替用户永久改掉已保存的手动选择。
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'travel-map-provider';
  // 同一个 DOM 容器的建图必须串行。Provider 解析/SDK 加载都是异步的，用户快速切换时
  // 两次 create() 可能重叠；Leaflet 会因此抛出「Map container already initialized」。
  // Adapter 在这里统一销毁前一实例并排队创建，业务页面不需要各自实现竞态保护。
  const containerStates = new WeakMap();

  // ================================================================ 坐标转换
  // 国测局加密坐标系（GCJ-02）标准换算公式，只在 AMapTravelMap 内部使用。
  const GCJ_A = 6378245.0, GCJ_EE = 0.00669342162296594323;
  function outOfChina(lat, lng) { return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271; }
  function transformLat(x, y) {
    let ret = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x));
    ret += (20*Math.sin(6*x*Math.PI) + 20*Math.sin(2*x*Math.PI)) * 2/3;
    ret += (20*Math.sin(y*Math.PI) + 40*Math.sin(y/3*Math.PI)) * 2/3;
    ret += (160*Math.sin(y/12*Math.PI) + 320*Math.sin(y*Math.PI/30)) * 2/3;
    return ret;
  }
  function transformLng(x, y) {
    let ret = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x));
    ret += (20*Math.sin(6*x*Math.PI) + 20*Math.sin(2*x*Math.PI)) * 2/3;
    ret += (20*Math.sin(x*Math.PI) + 40*Math.sin(x/3*Math.PI)) * 2/3;
    ret += (150*Math.sin(x/12*Math.PI) + 300*Math.sin(x/30*Math.PI)) * 2/3;
    return ret;
  }
  function wgs84ToGcj02(lat, lng) {
    if (outOfChina(lat, lng)) return [lat, lng];
    let dLat = transformLat(lng - 105.0, lat - 35.0);
    let dLng = transformLng(lng - 105.0, lat - 35.0);
    const radLat = lat / 180.0 * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - GCJ_EE * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / (GCJ_A / sqrtMagic * Math.cos(radLat) * Math.PI);
    return [lat + dLat, lng + dLng];
  }
  function gcj02ToWgs84(lat, lng) {
    if (outOfChina(lat, lng)) return [lat, lng];
    const shifted = wgs84ToGcj02(lat, lng);
    return [lat - (shifted[0] - lat), lng - (shifted[1] - lng)];
  }

  // ================================================================ Provider 解析
  let runtimePromise = null;
  function fetchRuntime() {
    if (!runtimePromise) {
      runtimePromise = fetch('/api/public/runtime').then(r => r.json()).then(body => body.data || body)
        .catch(() => ({
          region: null, mapProvider: 'AMAP', amapJsKey: '', amapServiceHost: '/api/public/_AMapService',
          osmTileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', osmAttribution: '© OpenStreetMap contributors'
        }));
    }
    return runtimePromise;
  }
  /** 与 Provider 选择器共用同一份运行时配置，避免同一页面重复请求。 */
  function runtime() { return fetchRuntime(); }
  function manualProvider() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === 'AMAP' || value === 'OSM' ? value : null;
    } catch (_) { return null; }
  }
  function setManualProvider(value) {
    try {
      if (value === 'AMAP' || value === 'OSM') localStorage.setItem(STORAGE_KEY, value);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }
  function providerUsable(provider, runtime) {
    if (provider === 'AMAP') return !!(runtime?.amapJsKey && String(runtime.amapJsKey).trim());
    return provider === 'OSM';
  }
  /** 优先级：用户手动选择 > 运行时 AUTO 判定。手动选择的值不受 AUTO 结果影响。 */
  async function resolveProvider() {
    const manual = manualProvider();
    if (manual) return { provider: manual, source: 'manual', region: null };
    const runtime = await fetchRuntime();
    const resolved = runtime.mapProvider === 'OSM' ? 'OSM' : 'AMAP';
    // 缺 Key 不是「高德加载失败」，而是部署时就没有启用高德。AUTO 直接使用 OSM，
    // 避免每个访客都看到一个注定失败的重试提示；用户手动选高德仍会明确报配置错误。
    const provider = resolved === 'AMAP' && !providerUsable('AMAP', runtime) ? 'OSM' : resolved;
    return { provider, source: 'auto', region: runtime.region || null };
  }

  // ================================================================ 高德 JS API 2.0 动态加载
  let amapScriptPromise = null;
  function loadAMapSdk(runtime) {
    if (window.AMap) return Promise.resolve(window.AMap);
    if (amapScriptPromise) return amapScriptPromise;
    amapScriptPromise = Promise.resolve(runtime).then(runtime => new Promise((resolve, reject) => {
      if (!runtime.amapJsKey) { amapScriptPromise = null; reject(new Error('未配置高德 Web端(JS API) Key')); return; }
      const serviceHost = new URL(runtime.amapServiceHost || '/api/public/_AMapService', location.origin).href.replace(/\/$/, '');
      // 必须在加载 SDK 前设置。浏览器只拿代理地址，真正的 securityJsCode 由服务端追加。
      window._AMapSecurityConfig = { serviceHost };
      const script = document.createElement('script');
      script.src = 'https://webapi.amap.com/maps?v=2.0&key=' + encodeURIComponent(runtime.amapJsKey);
      script.onload = () => {
        if (window.AMap) resolve(window.AMap);
        else { amapScriptPromise = null; reject(new Error('高德地图 SDK 未完成初始化')); }
      };
      script.onerror = () => { amapScriptPromise = null; reject(new Error('高德地图脚本加载失败')); };
      document.head.appendChild(script);
    }));
    return amapScriptPromise;
  }

  // ================================================================ AMapTravelMap
  function createAMapTravelMap(AMap, element, options) {
    const toGcj = point => wgs84ToGcj02(point[0], point[1]);
    const toWgs = lngLat => gcj02ToWgs84(
      typeof lngLat?.getLat === 'function' ? lngLat.getLat() : Number(lngLat?.lat),
      typeof lngLat?.getLng === 'function' ? lngLat.getLng() : Number(lngLat?.lng)
    );
    const center = options.center ? toGcj(options.center) : [35.0, 105.0];
    const map = new AMap.Map(element, {
      zoom: options.zoom || 4,
      center: [center[1], center[0]],
      viewMode: '2D',
      scrollWheel: options.scrollWheelZoom !== false,
      mapStyle: amapStyle(options.style)
    });
    let markers = [];
    let polyline = null;
    let infoWindow = null;

    function markerHandle(marker, htmlEl) {
      return {
        setActive(active) { if (htmlEl) htmlEl.classList.toggle('is-active', !!active); },
        openPopup() { if (marker.__popup) openInfoWindow(marker, marker.__popup); },
        getPosition() { const p = marker.getPosition(); return toWgs(p); },
        remove() { marker.setMap(null); markers = markers.filter(m => m !== marker); }
      };
    }
    function openInfoWindow(marker, content) {
      if (!infoWindow) infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -28), anchor: 'bottom-center' });
      infoWindow.setContent(content);
      infoWindow.open(map, marker.getPosition());
    }

    return {
      provider: 'AMAP',
      raw: map,
      destroy() {
        markers.forEach(m => m.setMap(null)); markers = [];
        if (polyline) polyline.setMap(null);
        if (infoWindow) infoWindow.close();
        map.destroy();
      },
      setCenter(point) { map.setCenter(toGcj(point).slice().reverse()); },
      panTo(point) { map.panTo(toGcj(point).slice().reverse()); },
      // AMap JS API 2.0 会自动响应容器尺寸变化，这里不强依赖某个具体方法名——
      // 拿不到就什么都不做，好过因为方法名对不上而抛错炸掉整个地图初始化。
      invalidateSize() { if (typeof map.resize === 'function') map.resize(); },
      getZoom() { return map.getZoom(); },
      zoomBy(delta) { map.setZoom(map.getZoom() + delta); },
      setStyle(style) { map.setMapStyle(amapStyle(style)); },
      fitBounds(points, fitOptions) {
        const opts = fitOptions || {};
        const valid = (points || []).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
        if (!valid.length) return;
        const gcj = valid.map(toGcj);
        if (gcj.length === 1) { map.setCenter([gcj[0][1], gcj[0][0]]); if (opts.maxZoom) map.setZoom(opts.maxZoom); return; }
        const lats = gcj.map(p => p[0]), lngs = gcj.map(p => p[1]);
        const bounds = new AMap.Bounds([Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]);
        map.setBounds(bounds, false);
        if (opts.maxZoom && map.getZoom() > opts.maxZoom) map.setZoom(opts.maxZoom);
      },
      addMarker(point, markerOptions) {
        const opts = markerOptions || {};
        const gcj = toGcj(point);
        const htmlEl = opts.html ? htmlToElement(opts.html) : null;
        const anchor = opts.iconAnchor || [14, 14];
        const marker = new AMap.Marker({
          position: [gcj[1], gcj[0]],
          content: htmlEl || undefined,
          offset: htmlEl ? new AMap.Pixel(-anchor[0], -anchor[1]) : undefined,
          draggable: !!opts.draggable,
          map
        });
        marker.__popup = opts.popup || null;
        if (opts.popup) marker.on('click', () => openInfoWindow(marker, opts.popup));
        if (opts.draggable && typeof opts.onDragEnd === 'function') {
          marker.on('dragend', () => { const wgs = toWgs(marker.getPosition()); opts.onDragEnd(wgs[0], wgs[1]); });
        }
        markers.push(marker);
        return markerHandle(marker, htmlEl);
      },
      setRoute(points, routeOptions) {
        this.removeRoute();
        const opts = routeOptions || {};
        const valid = (points || []).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
        if (valid.length < 2) return;
        const toAMapPath = pts => pts.map(p => { const g = toGcj(p); return [g[1], g[0]]; });
        polyline = new AMap.Polyline({
          path: opts.animate ? [toAMapPath(valid)[0]] : toAMapPath(valid),
          strokeColor: opts.color || '#c96f4e',
          strokeWeight: opts.width || 4,
          strokeOpacity: opts.opacity == null ? 0.82 : opts.opacity,
          strokeStyle: opts.dashed ? 'dashed' : 'solid',
          map
        });
        if (opts.animate) {
          const line = polyline;
          animateRoutePath(pts => line.setPath(toAMapPath(pts)), valid, 1200);
        }
      },
      removeRoute() { if (polyline) { polyline.setMap(null); polyline = null; } },
      onClick(handler) { map.on('click', event => { const wgs = toWgs(event.lnglat); handler(wgs[0], wgs[1]); }); },
      onInteractionStart(handler) { map.on('dragstart', handler); map.on('mousedown', handler); }
    };
  }

  /** 两个 Provider 只保持风格语义相近，不追求像素一致。 */
  function amapStyle(style) {
    const schemeDark = document.documentElement.dataset.scheme === 'dark';
    // whitesmoke 是近灰白低饱和样式，会让 AUTO/浅色主题看起来像地图没有颜色。
    // 浅色语义使用高德标准彩色底图；只有暗色、复古、地形增强选择专用样式。
    const key = style === 'auto' ? (schemeDark ? 'dark' : 'normal') : style;
    const names = { normal:'normal', dark:'dark', light:'normal', vintage:'macaron', terrain:'fresh' };
    return 'amap://styles/' + (names[key] || 'normal');
  }

  function htmlToElement(html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    return wrapper.firstElementChild || wrapper;
  }

  /**
   * 路线绘制动画：从起点到终点逐段延伸，而不是一次性铺满。两个 Provider 都只需要
   * 一个「重新设置整条路径」的回调，不用碰 SVG 内部结构或各家的动画插件，
   * 实现成本最低，效果也是「语义一致」——真的在画，不要求两边像素级一致。
   */
  function animateRoutePath(setPath, fullPoints, duration) {
    const start = performance.now();
    const total = fullPoints.length;
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const exact = t * (total - 1);
      const index = Math.floor(exact);
      const fraction = exact - index;
      const path = fullPoints.slice(0, index + 1);
      if (index < total - 1 && fraction > 0) {
        const a = fullPoints[index], b = fullPoints[index + 1];
        path.push([a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction]);
      }
      setPath(path);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ================================================================ LeafletTravelMap
  // 现有 Leaflet + OSM 实现的直接封装，公开端和后台的瓦片、marker、路线画法不变。
  function createLeafletTravelMap(element, options) {
    const L = window.L;
    const map = L.map(element, {
      scrollWheelZoom: options.scrollWheelZoom !== false,
      tap: true,
      zoomControl: true
    }).setView(options.center || [30, 110], options.zoom || 4);
    L.tileLayer(options.osmTileUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: options.osmAttribution || '© OpenStreetMap contributors', maxZoom: 18
    }).addTo(map);
    let markers = [];
    let polyline = null;

    function markerHandle(marker) {
      return {
        setActive(active) { marker._icon?.classList.toggle('is-active', !!active); },
        openPopup() { marker.openPopup(); },
        getPosition() { const p = marker.getLatLng(); return [p.lat, p.lng]; },
        remove() { map.removeLayer(marker); markers = markers.filter(m => m !== marker); }
      };
    }

    return {
      provider: 'OSM',
      raw: map,
      destroy() { markers.forEach(m => map.removeLayer(m)); if (polyline) map.removeLayer(polyline); map.remove(); },
      setCenter(point) { map.setView(point, map.getZoom()); },
      panTo(point) { map.panTo(point, { animate: true, duration: 0.8 }); },
      invalidateSize() { map.invalidateSize(false); },
      getZoom() { return map.getZoom(); },
      zoomBy(delta) { map.setZoom(map.getZoom() + delta); },
      // OSM 风格由统一的 data-map-style CSS 语义实现，不需要重建 TileLayer。
      setStyle() {},
      fitBounds(points, fitOptions) {
        const opts = fitOptions || {};
        const valid = (points || []).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
        if (!valid.length) return;
        if (valid.length === 1) { map.setView(valid[0], opts.maxZoom || map.getZoom()); return; }
        map.fitBounds(valid, { padding: opts.padding || [36, 36], maxZoom: opts.maxZoom || 15 });
      },
      addMarker(point, markerOptions) {
        const opts = markerOptions || {};
        const anchor = opts.iconAnchor || [14, 14];
        const icon = opts.html
          ? L.divIcon({ className: 'travel-map-marker', html: opts.html, iconSize: [anchor[0]*2, anchor[1]*2], iconAnchor: anchor })
          : undefined;
        const marker = L.marker(point, { icon, draggable: !!opts.draggable }).addTo(map);
        if (opts.popup) marker.bindPopup(opts.popup);
        if (opts.draggable && typeof opts.onDragEnd === 'function') {
          marker.on('dragend', event => { const p = event.target.getLatLng(); opts.onDragEnd(p.lat, p.lng); });
        }
        markers.push(marker);
        return markerHandle(marker);
      },
      setRoute(points, routeOptions) {
        this.removeRoute();
        const opts = routeOptions || {};
        const valid = (points || []).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
        if (valid.length < 2) return;
        polyline = L.polyline(opts.animate ? [valid[0]] : valid, {
          color: opts.color || '#c96f4e', weight: opts.width || 4,
          opacity: opts.opacity == null ? 0.82 : opts.opacity,
          dashArray: opts.dashed ? '8 7' : null
        }).addTo(map);
        if (opts.animate) {
          const line = polyline;
          animateRoutePath(pts => line.setLatLngs(pts), valid, 1200);
        }
      },
      removeRoute() { if (polyline) { map.removeLayer(polyline); polyline = null; } },
      onClick(handler) { map.on('click', event => handler(event.latlng.lat, event.latlng.lng)); },
      onInteractionStart(handler) { map.on('mousedown dragstart', handler); }
    };
  }

  // ================================================================ 对外入口
  /**
   * @param element  地图容器 DOM
   * @param options  {center:[lat,lng], zoom, scrollWheelZoom, provider}
   *                 options.provider 显式指定时跳过解析（用于手动切换/失败重试）
   * @returns Promise<TravelMapInstance>，provider 不可用时 reject，调用方自行决定怎么提示、要不要换一个重试
   */
  async function createProviderMap(element, options) {
    if (!element) throw new Error('缺少地图容器');
    const runtime = await fetchRuntime();
    const opts = { osmTileUrl:runtime.osmTileUrl, osmAttribution:runtime.osmAttribution, ...(options || {}) };
    const resolved = opts.provider ? { provider: opts.provider, source: 'manual' } : await resolveProvider();
    if (resolved.provider === 'AMAP') {
      const AMap = await loadAMapSdk(runtime);
      return createAMapTravelMap(AMap, element, opts);
    }
    if (!window.L) throw new Error('地图组件加载失败，请刷新页面重试');
    return createLeafletTravelMap(element, opts);
  }

  async function create(element, options) {
    if (!element) throw new Error('缺少地图容器');
    let state = containerStates.get(element);
    if (!state) {
      state = { queue: Promise.resolve(), instance: null, generation: 0 };
      containerStates.set(element, state);
    }
    const generation = state.generation;
    const task = state.queue.catch(() => {}).then(async () => {
      // 容器在排队期间已经被页面卸载，不再创建一张落在失效 DOM 上的地图。
      if (generation !== state.generation) return null;
      state.instance?.destroy();
      state.instance = null;
      const instance = await createProviderMap(element, options);
      // SDK / Provider 加载期间也可能发生路由切换。实例刚创建出来就立即释放，
      // 不留下 ResizeObserver、地图事件或瓦片请求。
      if (generation !== state.generation) {
        instance.destroy();
        return null;
      }
      const destroyProvider = instance.destroy.bind(instance);
      let destroyed = false;
      instance.destroy = () => {
        if (destroyed) return;
        destroyed = true;
        destroyProvider();
        if (state.instance === instance) state.instance = null;
      };
      state.instance = instance;
      return instance;
    });
    // 失败也要放行下一次重试；task 自身仍保留 rejection 给当前调用方显示失败提示。
    state.queue = task.then(() => undefined, () => undefined);
    return task;
  }

  /**
   * 按容器销毁当前实例，并让该容器上尚未完成的异步 create 失效。
   * 失败提示里的“尝试另一 Provider”是页面级临时重试，调用方不一定拿得到新实例，
   * 所以组件卸载时还需要这一层兜底清理。
   */
  function destroy(element) {
    const state = element ? containerStates.get(element) : null;
    if (!state) return;
    state.generation += 1;
    state.instance?.destroy();
    state.instance = null;
  }

  window.TravelMap = {
    create,
    destroy,
    runtime,
    resolveProvider,
    manualProvider,
    setManualProvider,
    providerUsable,
    wgs84ToGcj02,
    gcj02ToWgs84
  };
})();
