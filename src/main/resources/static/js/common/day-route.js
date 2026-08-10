/*
 * 今日路线与回放。
 *
 * 一篇日记读完之后，「那天到底是怎么走的」是最自然的下一个问题。这个模块把
 * 服务端算好的路线点画在地图上，并提供一个回放：按时间依次把镜头移到每个点，
 * 停一下，弹出当时写的那句话和拍的照片。
 *
 * 回放的意义是把人放回当时的现场，所以它刻意慢——每个点停三秒多，
 * 而不是快速扫过去。任何时候点一下地图或按 Esc 都能停下。
 *
 * 地图实例由调用方创建并传进来（公开端和后台各有自己的瓦片配置），
 * 这里只负责画点、连线和控制回放节奏。
 */
(function () {
  'use strict';
  /** 每个点停留多久。慢一点才像回忆，快了就只是动画。 */
  const STEP_MS = 3200;

  function safePoints(points) {
    return (points || []).filter(point =>
      Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)));
  }

  /** 弹窗内容用 DOM 拼而不是拼字符串——正文和地点名都是用户输入的。 */
  function popup(point) {
    const root = document.createElement('div');
    root.className = 'travel-map-popup day-route-popup';
    const title = document.createElement('strong');
    title.textContent = [point.time, point.title].filter(Boolean).join(' · ');
    root.appendChild(title);
    if (point.note) {
      const note = document.createElement('p');
      note.textContent = point.note;
      root.appendChild(note);
    }
    if (point.photos && point.photos.length) {
      const shots = document.createElement('div');
      shots.className = 'day-route-shots';
      point.photos.slice(0, 4).forEach(photo => {
        const image = document.createElement('img');
        image.src = photo.thumbnailUrl;
        image.alt = point.title || '旅行照片';
        image.loading = 'lazy';
        shots.appendChild(image);
      });
      root.appendChild(shots);
    }
    return root;
  }

  /**
   * 在地图上画出一天的路线。
   *
   * @returns 一个控制器：play() 开始回放，stop() 停下，destroy() 清理
   */
  function render(map, points, options) {
    const settings = options || {};
    const list = safePoints(points);
    if (!map || !list.length) return null;
    const L = window.L;
    const markers = [];
    const coords = [];

    list.forEach(point => {
      const position = [Number(point.latitude), Number(point.longitude)];
      coords.push(position);
      const icon = L.divIcon({
        className: 'travel-map-marker day-route-marker',
        html: '<span class="route-marker">' + point.order + '</span>',
        iconSize: [28, 28], iconAnchor: [14, 14]
      });
      markers.push(L.marker(position, { icon }).addTo(map).bindPopup(popup(point)));
    });
    // 计划来的那条线用虚线，实际走过的用实线——它们不是同一种事实
    const line = coords.length > 1
      ? L.polyline(coords, {
          color: settings.color || '#c96f4e', weight: 4, opacity: .82,
          dashArray: settings.source === 'moment' ? null : '8 7'
        }).addTo(map)
      : null;
    if (coords.length) map.fitBounds(coords, { padding: [36, 36], maxZoom: 15 });

    let timer = null, index = -1;
    function stop() {
      clearTimeout(timer);
      timer = null;
      index = -1;
      markers.forEach(marker => marker._icon?.classList.remove('is-active'));
      if (settings.onState) settings.onState({ playing: false, index: -1 });
    }
    function step() {
      index += 1;
      if (index >= markers.length) { stop(); return; }
      markers.forEach((marker, i) => marker._icon?.classList.toggle('is-active', i === index));
      const marker = markers[index];
      map.panTo(marker.getLatLng(), { animate: true, duration: .8 });
      marker.openPopup();
      if (settings.onState) settings.onState({ playing: true, index: index, point: list[index] });
      timer = setTimeout(step, STEP_MS);
    }
    function play() {
      if (timer) { stop(); return; }
      index = -1;
      step();
    }
    // 回放时随便点一下地图就停：正在看的人想自己操作，不该跟它抢镜头
    map.on('mousedown dragstart', () => { if (timer) stop(); });

    return {
      play, stop,
      get playing() { return !!timer; },
      destroy() {
        stop();
        markers.forEach(marker => map.removeLayer(marker));
        if (line) map.removeLayer(line);
      }
    };
  }

  /*
   * 一个够用就好的地图底图，给后台自己看的那些页面用。
   *
   * 公开端的 createMap 做了瓦片源自动回退、图层切换、Ctrl+滚轮缩放提示这些事，
   * 因为它面向的是不特定的读者和网络。后台只有站主一个人在用，他知道自己的网络
   * 什么样，也不需要在两种瓦片之间选——所以这里不共用那一套，只留最小的一份。
   */
  function simpleMap(element, options) {
    if (!element || !window.L) return null;
    const settings = options || {};
    const map = window.L.map(element, { scrollWheelZoom: true, zoomControl: true })
      .setView(settings.center || [30, 110], settings.zoom || 4);
    window.L.tileLayer(
      'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
      { subdomains: '1234', attribution: '© 高德地图', maxZoom: 18 }).addTo(map);
    requestAnimationFrame(() => map.invalidateSize(false));
    return map;
  }

  window.DayRoute = { render, simpleMap, STEP_MS };
})();
