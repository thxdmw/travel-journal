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
  if (!publicPages?.JournalCard || !publicPages?.MapProviderSwitch || !publicPages?.Journals || !publicPages?.Trips || !publicPages?.YearReview || !publicPages?.createFootprintMapPage || !publicPages?.createHomePage || !publicPages?.createTripDetailPage) {
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

  const JournalDetail = {
    // preview=true 时按令牌取内容，用于草稿预览。除数据来源外与正式详情页完全一致，
    // 这样预览看到的就是发布后的真实样子（同一套主题、外壳和图片版式）。
    props: { preview: { type: Boolean, default: false } },
    components: { MapProviderSwitch },
    setup(props) {
      const route = VueRouter.useRoute();
      const data = ref(null);
      const previewFailed = ref(false);
      const article = ref(null);
      const lightbox = ref(null);
      const progress = ref(0);
      const html = computed(() => data.value ? window.JournalBlocks.render(data.value.contentJson, data.value.media) : '');
      const readingMinutes = computed(() => Math.max(1,Math.ceil(window.JournalBlocks.wordCount(data.value?.contentJson)/500)));
      const current = computed(() => lightbox.value ? lightbox.value.items[lightbox.value.index] : null);
      // 灯箱统一按「一组」打开：正文里的多图块是一组，零散单图整篇算一组，
      // 正文后的图片库整体算一组，这样左右键都能翻。
      function openLightbox(items, index) { lightbox.value = { items, index: Math.max(0, index) }; }
      function openArticleImage(event) {
        if (!(event.target instanceof HTMLImageElement)) return;
        if (!event.target.matches(window.JournalMedia.MEDIA_SELECTOR)) return;
        const group = window.JournalMedia.groupOf(event.target);
        openLightbox(group.map(image => ({ src: image.src, caption: image.alt || '' })), group.indexOf(event.target));
      }
      function stepLightbox(delta) {
        if (!lightbox.value) return;
        const total = lightbox.value.items.length;
        lightbox.value.index = (lightbox.value.index + delta + total) % total;
      }
      function onKeydown(event) {
        if (!lightbox.value) return;
        if (event.key === 'Escape') lightbox.value = null;
        else if (event.key === 'ArrowLeft') stepLightbox(-1);
        else if (event.key === 'ArrowRight') stepLightbox(1);
      }
      function updateProgress(){const height=document.documentElement.scrollHeight-window.innerHeight;progress.value=height>0?Math.min(100,Math.max(0,window.scrollY/height*100)):0;}
      /*
       * 今日路线。
       *
       * 读完一篇日记之后，「那天到底是怎么走的」是最自然的下一个问题。路线点由
       * 服务端算好：优先用当天的随手记（实际去过），没有随手记时回落到当天的城市和
       * 行程（计划要去）。两者的可信度不一样，所以下面的说法和线型都跟着变。
       */
      const routeEl=ref(null),replaying=ref(false),replayIndex=ref(-1);
      let routeMap=null,routeControl=null,routeTornDown=false;
      const routePoints=computed(()=>data.value?.route||[]);
      const routeIsReal=computed(()=>routePoints.value[0]?.source==='moment');
      const routeTitle=computed(()=>routeIsReal.value?'这一天走过的路':'这一天的安排');
      const replayLabel=computed(()=>replaying.value?'停止回放':(routeIsReal.value?'▶ 回放这一天':'▶ 依次看一遍'));
      async function setupRoute(){
        if(!routePoints.value.length||!routeEl.value||routeMap)return;
        const map=await createMap(routeEl.value,[],{});
        // 地图还没加载完组件就被卸载了（比如很快切到下一篇），直接销毁掉，不留悬空实例
        if(routeTornDown||!map){map?.destroy();return;}
        routeMap=map;
        routeControl=window.DayRoute?.render(routeMap,routePoints.value,{
          source:routePoints.value[0]?.source,
          onState:state=>{replaying.value=state.playing;replayIndex.value=state.index;}
        });
      }
      function toggleReplay(){routeControl?.play();}
      function teardownRoute(){routeTornDown=true;routeControl?.destroy();routeControl=null;routeMap?.destroy();routeMap=null;window.TravelMap?.destroy(routeEl.value);}
      // 手动切换地图 Provider 后，当天路线需要在新 Provider 上重新画一遍
      function restartRoute(){teardownRoute();routeTornDown=false;setupRoute();}
      /*
       * 阅读字号档位。手机上字号直接决定一屏能读到多少，交给读者自己定最实在。
       * 只改 --reading-scale 这一个变量，正文、图注和标题都跟着走。
       */
      const SCALES=[0.88,1,1.14,1.3];
      const scaleIndex=ref(Math.min(SCALES.length-1,Math.max(0,Number(localStorage.getItem('travel-journal.reading-scale'))||1)));
      const scaleLabel=computed(()=>['小','标准','大','特大'][scaleIndex.value]);
      function applyScale(){document.documentElement.style.setProperty('--reading-scale',SCALES[scaleIndex.value]);}
      function stepScale(delta){
        scaleIndex.value=Math.min(SCALES.length-1,Math.max(0,scaleIndex.value+delta));
        localStorage.setItem('travel-journal.reading-scale',String(scaleIndex.value));
        applyScale();
      }
      applyScale();
      // 正文是 v-html 塞进来的，轮播和前后对比的结构只能在渲染之后补
      watch(html, () => nextTick(() => { window.JournalMedia.teardown(article.value); window.JournalMedia.enhance(article.value); }));
      onMounted(async () => { try { data.value = props.preview ? await api.preview(route.params.token) : await api.journal(route.params.slug); } catch (e) { previewFailed.value = true; throw e; } setScopedTheme(data.value.theme); window.addEventListener('keydown', onKeydown);window.addEventListener('scroll',updateProgress,{passive:true});nextTick(()=>{updateProgress();window.JournalMedia.enhance(article.value);setupRoute();}); });
      onBeforeUnmount(() => {window.JournalMedia.teardown(article.value);window.removeEventListener('keydown', onKeydown);window.removeEventListener('scroll',updateProgress);teardownRoute();clearScopedTheme();});
      return { data, article, html, lightbox, current, progress, readingMinutes, preview: props.preview, previewFailed,
               scaleIndex, scaleLabel, scaleMax: SCALES.length - 1, stepScale,
               routeEl, routePoints, routeTitle, routeIsReal, replaying, replayIndex, replayLabel, toggleReplay, restartRoute,
               openLightbox, openArticleImage, stepLightbox };
    },
    template: `
      <main v-if="data" class="page article">
        <div class="reading-progress" aria-hidden="true"><span :style="{width:progress+'%'}"></span></div>
        <div v-if="preview" class="preview-banner">草稿预览 · 这篇日记尚未发布，链接会过期</div>
        <header class="article-head"><div class="hero-kicker">{{data.journal.tripTitle || '独立日记'}}<template v-if="data.journal.cityName"> · {{data.journal.cityName}}</template></div><h1>{{data.journal.title}}</h1><p v-if="data.journal.excerpt" class="article-excerpt">{{data.journal.excerpt}}</p><div class="article-meta">{{data.journal.occurredOn}} · 约 {{readingMinutes}} 分钟阅读</div>
          <div class="reading-scale"><button type="button" aria-label="减小正文字号" :disabled="scaleIndex===0" @click="stepScale(-1)">A−</button><span>{{scaleLabel}}</span><button type="button" aria-label="增大正文字号" :disabled="scaleIndex===scaleMax" @click="stepScale(1)">A+</button></div></header>
        <article ref="article" class="journal-document" v-html="html" @click="openArticleImage"></article>
        <section v-if="routePoints.length" class="day-route">
          <header><h2>{{routeTitle}}</h2>
            <p v-if="!routeIsReal" class="day-route-hint">这条线来自当天的行程安排，不是实际走过的轨迹。</p>
            <button type="button" class="day-route-play" :class="{playing:replaying}" @click="toggleReplay">{{replayLabel}}</button>
          </header>
          <map-provider-switch @change="restartRoute"/>
          <div ref="routeEl" class="day-route-map"></div>
          <ol class="day-route-list">
            <li v-for="(point,index) in routePoints" :key="point.order" :class="{'is-active':replayIndex===index}">
              <time>{{point.time||'—'}}</time><strong>{{point.title}}</strong><span v-if="point.note">{{point.note}}</span>
            </li>
          </ol>
        </section>
        <nav class="article-nav"><router-link v-if="data.previousSlug" :to="'/journals/'+data.previousSlug">← 上一篇</router-link><span v-else></span><router-link v-if="data.nextSlug" :to="'/journals/'+data.nextSlug">下一篇 →</router-link></nav>
        <teleport to="body"><div v-if="lightbox" class="photo-lightbox" role="dialog" aria-modal="true" @click.self="lightbox=null">
          <button type="button" class="lightbox-close" aria-label="关闭大图" @click="lightbox=null">×</button>
          <button v-if="lightbox.items.length>1" type="button" class="lightbox-step lightbox-step--prev" aria-label="上一张" @click.stop="stepLightbox(-1)">‹</button>
          <button v-if="lightbox.items.length>1" type="button" class="lightbox-step lightbox-step--next" aria-label="下一张" @click.stop="stepLightbox(1)">›</button>
          <figure @click.stop><img :src="current.src" :alt="current.caption || '旅行照片'"><figcaption v-if="current.caption">{{current.caption}}</figcaption></figure>
          <span v-if="lightbox.items.length>1" class="lightbox-count">{{lightbox.index+1}} / {{lightbox.items.length}}</span>
        </div></teleport>
      </main>
      <div v-else-if="previewFailed" class="loading">预览链接无效或已过期。</div>
      <div v-else class="loading">正在展开日记…</div>`
  };

  // ------------------------------------------------------------ 主题设计器：三场景预览
  // 主题设置分布在首页、日记正文和地图三处，右侧预览用固定的示例数据分别渲染这三个场景，
  // 不依赖当前数据库里有没有足够内容——这样一个设置改了没生效，还是当前场景本来就没有
  // 对应元素，用户能立刻分清楚。三个场景已经覆盖绝大多数 Theme Token 的实际落点。
  const THEME_PREVIEW_IMAGE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#d8cbb4"/>' +
    '<path d="M0 470L230 250l160 150 140-110 370 310H0z" fill="#8da091"/><circle cx="690" cy="150" r="58" fill="#f7e3a1"/></svg>');
  const THEME_PREVIEW_HOME_JOURNALS = ['京都的第三个清晨', '青城山下的一整天', '冰岛公路上的极光', '清迈夜市的一碗面', '威尼斯的水上巴士', '东京深夜的居酒屋']
    .map((title, index) => ({
      id: 'preview-' + index, slug: 'preview', title,
      excerpt: '风景会远去，文字让当时的心情重新回来。这一段还在等待被慢慢写完。',
      occurredOn: '2026-0' + (index % 9 + 1) + '-12', cityName: ['京都', '成都', '雷克雅未克', '清迈', '威尼斯', '东京'][index],
      coverUrl: THEME_PREVIEW_IMAGE
    }));
  // 覆盖全部可主题化 Journal Block：开场、章节、标题、正文、引用、提示卡、地点卡、
  // 时间线、数字亮点、单图、图片组、分隔线、今日小结。目的不是模拟真实内容，
  // 是把能主题化的区块全部露出来，改一个设置就能立刻在这里看到。
  const THEME_PREVIEW_JOURNAL_DOCUMENT = {
    schemaVersion: 1,
    blocks: [
      { id: 'preview-day-opener', type: 'day-opener', version: 1, title: '', data: { city: '成都', dayLabel: 'Day 2', date: '2026-08-10', weather: '晴', route: ['成都', '都江堰', '青城山'], metrics: [{ value: '21,430', label: '步' }, { value: '¥ 420', label: '花费' }] }, settings: {} },
      { id: 'preview-chapter', type: 'chapter', version: 1, title: '', data: { time: '08:30', title: '清晨出发', note: '从成都出发，一路向西' }, settings: {} },
      { id: 'preview-heading', type: 'heading', version: 1, title: '', data: { text: '都江堰的水声', level: 2 }, settings: {} },
      { id: 'preview-paragraph', type: 'paragraph', version: 1, title: '', data: { text: '站在鱼嘴分水堤上，能听见很远就传来的水声。两千多年前的工程，到现在还在按原来的方式分水。' }, settings: { style: 'normal', align: 'left' } },
      { id: 'preview-quote', type: 'quote', version: 1, title: '', data: { text: '有些风景，只有慢下来才看得见。', source: '旅途手记' }, settings: {} },
      { id: 'preview-callout', type: 'callout', version: 1, title: '', data: { tone: 'tip', icon: '✦', text: '下午三点后人会少很多，适合拍照。' }, settings: {} },
      { id: 'preview-location', type: 'location-card', version: 1, title: '', data: { name: '青城山', address: '成都市都江堰市青城山镇', hours: '08:00–17:30', cost: '80 元', impression: '树荫很多，山路不算陡，适合慢慢走完一整圈。' }, settings: {} },
      { id: 'preview-timeline', type: 'timeline', version: 1, title: '', data: { items: [{ time: '09:30', title: '进入山门', description: '买了一份地图，沿着主路上山' }, { time: '11:50', title: '到达上清宫', description: '在这里歇脚吃了午饭' }, { time: '15:20', title: '下山回到街子古镇', description: '喝了一下午的茶' }] }, settings: {} },
      { id: 'preview-stats', type: 'stats', version: 1, title: '', data: { items: [{ value: '18,642', label: '步' }, { value: '12.8 km', label: '路程' }, { value: '86', label: '张照片' }] }, settings: {} },
      // 不写区块级 size/layout/columns override，专门展示当前主题的图片与 Gallery 默认值。
      { id: 'preview-image', type: 'image', version: 1, title: '', data: { previewUrl: THEME_PREVIEW_IMAGE, caption: '山间的一刻' }, settings: {} },
      { id: 'preview-gallery', type: 'gallery', version: 1, title: '', data: { previewUrls: [THEME_PREVIEW_IMAGE, THEME_PREVIEW_IMAGE, THEME_PREVIEW_IMAGE], caption: '这一天拍的照片' }, settings: {} },
      { id: 'preview-divider', type: 'divider', version: 1, title: '', data: {}, settings: {} },
      { id: 'preview-day-summary', type: 'day-summary', version: 1, title: '', data: { items: [{ icon: '🌟', label: '今天最喜欢', value: '都江堰的水声' }, { icon: '💴', label: '今日花费', value: '¥ 420' }] }, settings: {} }
    ]
  };
  // 固定的四点路线：成都 → 都江堰 → 青城山 → 成都。source:'moment' 让它按「实际走过」
  // 画成实线，视觉上比计划路线的虚线更接近真实回放效果。
  const THEME_PREVIEW_ROUTE_POINTS = [
    { order: 1, time: '09:00', title: '成都', note: '从市区出发', latitude: 30.6598, longitude: 104.0633, photos: [] },
    { order: 2, time: '10:30', title: '都江堰', note: '看鱼嘴分水堤', latitude: 31.0044, longitude: 103.6053, photos: [] },
    { order: 3, time: '12:00', title: '青城山', note: '爬到上清宫', latitude: 30.9021, longitude: 103.5678, photos: [] },
    { order: 4, time: '17:00', title: '成都', note: '回到市区', latitude: 30.6598, longitude: 104.0633, photos: [] }
  ];

  const ThemePreviewScene = {
    components: { JournalCard },
    setup() {
      const requestedScene = new URLSearchParams(location.search).get('scene') || 'home';
      const scene = ['home','journal','map'].includes(requestedScene) ? requestedScene : 'home';
      const journalArticle = ref(null);
      const mapEl = ref(null);
      let routeMap = null, routeControl = null, tornDown = false;
      function refreshMapTheme() {
        if (scene !== 'map') return;
        const theme = window.TravelTheme?.mapTokens?.() || {};
        routeMap?.setStyle?.(theme.style);
        routeControl?.refreshTheme?.();
      }
      function refreshJournalMedia() {
        if (scene !== 'journal' || !journalArticle.value) return;
        window.JournalMedia.teardown(journalArticle.value);
        window.JournalMedia.enhance(journalArticle.value);
      }
      function refreshSceneTheme() { refreshMapTheme(); refreshJournalMedia(); }
      onMounted(async () => {
        window.addEventListener('travel-theme-applied', refreshSceneTheme);
        await nextTick();
        if (scene === 'journal') window.JournalMedia.enhance(journalArticle.value);
        if (scene === 'map') {
          // Studio 的地图是固定 Fixture：使用本地 Leaflet 资源，不依赖访客地区、
          // localStorage 或高德 Key；真实页面仍按 AUTO / AMAP / OSM 选择。
          const map = await window.TravelMap.create(mapEl.value, {
            provider:'OSM', zoom:8, style:window.TravelTheme?.mapTokens?.().style
          });
          if (tornDown || !map) { map?.destroy(); return; }
          routeMap = map;
          routeControl = window.DayRoute?.render(routeMap, THEME_PREVIEW_ROUTE_POINTS, { source: 'moment' });
        }
      });
      onBeforeUnmount(() => { tornDown = true; window.removeEventListener('travel-theme-applied', refreshSceneTheme); window.JournalMedia.teardown(journalArticle.value); routeControl?.destroy(); routeMap?.destroy(); window.TravelMap?.destroy(mapEl.value); });
      return {
        scene, journalArticle, mapEl,
        homeJournals: THEME_PREVIEW_HOME_JOURNALS,
        journalHtml: window.JournalBlocks.render(THEME_PREVIEW_JOURNAL_DOCUMENT, [])
      };
    },
    template: `
      <main v-if="scene==='home'" class="home-page-shell theme-preview-scene" data-theme-preview-fixture="home">
        <section class="hero">
          <div class="hero-copy">
            <span class="hero-kicker">PERSONAL TRAVEL JOURNAL</span>
            <h1>把走过的路，<br>写成自己的故事</h1>
            <p>记录城市、光影和旅途中那些不愿忘记的时刻。这里没有攻略排名，只有属于自己的远方。</p>
            <a class="primary-btn" href="javascript:void(0)">浏览旅行日记</a>
          </div>
          <div class="hero-photo home-hero-photo" role="img" aria-label="示例封面"></div>
        </section>
        <div class="page home-page">
          <section class="section">
            <div class="section-head"><h2 class="section-title">最近的旅行日记</h2><a class="text-link" href="javascript:void(0)">查看全部 ›</a></div>
            <div class="card-grid"><journal-card v-for="item in homeJournals" :key="item.id" :item="item"/></div>
          </section>
          <section class="section map-stats">
            <div class="map-panel"><h2 class="section-title" style="font-size:21px;margin-bottom:18px">我的足迹地图</h2><div class="map-box theme-preview-map-placeholder">地图场景请切到「地图」预览</div></div>
            <div class="stats-panel">
              <h2 class="section-title" style="font-size:21px;margin-bottom:18px">旅行数据</h2>
              <div class="stats-grid">
                <div class="stat"><strong>12</strong><span>去过的旅行</span></div>
                <div class="stat"><strong>48</strong><span>旅行日记</span></div>
                <div class="stat"><strong>26</strong><span>打卡城市</span></div>
                <div class="stat"><strong>1,280</strong><span>旅行照片</span></div>
              </div>
              <p class="quote">"世界很大，而你的故事，值得被记录。"</p>
            </div>
          </section>
        </div>
      </main>
      <main v-else-if="scene==='journal'" class="page article theme-preview-scene" data-theme-preview-fixture="journal">
        <header class="article-head"><div class="hero-kicker">示例旅行 · 成都</div><h1>都江堰与青城山的一天</h1><p class="article-excerpt">这是主题设计器的固定示例日记，用来展示日记正文里所有可主题化的内容块。</p><div class="article-meta">2026-08-10 · 约 4 分钟阅读</div></header>
        <article ref="journalArticle" class="journal-document" v-html="journalHtml"></article>
      </main>
      <main v-else class="page theme-preview-scene" data-theme-preview-fixture="map">
        <div class="page-title"><span class="eyebrow">ROUTE PREVIEW</span><h1>示例路线</h1><p>成都 → 都江堰 → 青城山 → 成都，用来展示地图相关的主题设置。</p></div>
        <div class="map-panel"><div ref="mapEl" class="map-box" style="height:520px"></div></div>
      </main>`
  };

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

  const App = {
    setup() {
      const menu = ref(false);
      const profile = ref({ displayName:'旅行者', avatarUrl:null, themeKey:'travel-classic' });
      watch(() => router.currentRoute.value.fullPath, () => menu.value = false);
      /**
       * 设计器改了某个设置时，除了推新主题，还会顺带说「大概改的是哪块」（一个 CSS
       * selector）。找到就短暂加个高亮边框，900ms 后自动摘掉——用户不用来回猜。
       */
      function highlightPreviewTarget(selector){
        if(!selector)return;
        document.querySelectorAll(selector).forEach(el=>{
          el.classList.remove('tj-preview-highlight');
          void el.offsetWidth;
          el.classList.add('tj-preview-highlight');
          setTimeout(()=>el.classList.remove('tj-preview-highlight'),900);
        });
      }
      function previewTheme(event){
        if(event.origin!==location.origin)return;
        if(event.data?.type==='travel-theme-preview')applyTheme(event.data.theme,{persist:false});
        else if(event.data?.type==='travel-theme-highlight')highlightPreviewTarget(event.data.selector);
      }
      // 菜单现在是浮层，点旁边任何地方都该收起来；Esc 同理
      function closeMenuOutside(event){ if(menu.value && !event.target.closest('.public-nav, .mobile-menu')) menu.value = false; }
      function closeMenuOnEsc(event){ if(event.key === 'Escape') menu.value = false; }
      onMounted(async () => {
        window.addEventListener('message',previewTheme);
        document.addEventListener('click',closeMenuOutside);
        window.addEventListener('keydown',closeMenuOnEsc);
        if(!isThemePreview)try {
          profile.value = await api.profile();
          setSiteTheme(profile.value.theme||profile.value.themeKey);
        } catch (_) { }
      });
      onBeforeUnmount(()=>{
        window.removeEventListener('message',previewTheme);
        document.removeEventListener('click',closeMenuOutside);
        window.removeEventListener('keydown',closeMenuOnEsc);
      });
      return { menu, profile, isThemePreview };
    },
    template: `
      <div class="public-shell">
        <header v-if="!isThemePreview" class="public-header"><div class="header-inner"><router-link class="brand" to="/">远行手记</router-link>
          <button class="mobile-menu" type="button" :aria-expanded="menu" aria-label="打开前台导航" @click="menu=!menu">☰</button>
          <nav class="public-nav" :class="{open:menu}"><router-link to="/">首页</router-link><router-link to="/trips">旅行</router-link><router-link to="/journals">日记</router-link><router-link to="/map">足迹地图</router-link><router-link to="/years">年度回顾</router-link></nav>
          <a class="admin-link" href="/admin/" :title="profile.displayName + ' · 管理后台'" aria-label="进入管理后台"><img v-if="profile.avatarUrl" :src="profile.avatarUrl" alt="管理员头像"><span v-else>旅</span></a>
        </div></header>
        <header v-else class="public-header theme-preview-header" aria-label="固定示例站点导航"><div class="header-inner"><span class="brand">远行手记</span><nav class="public-nav"><span>首页</span><span>旅行</span><span>日记</span><span>足迹地图</span><span>年度回顾</span></nav><span class="admin-link" aria-hidden="true"><span>示</span></span></div></header>
        <span v-if="isThemePreview" class="theme-preview-fixed-badge" aria-hidden="true">固定示例 · 不读取站点内容</span>
        <router-view></router-view>
        <footer class="public-footer">远行手记 · {{isThemePreview?'固定主题示例':'把走过的路写成自己的故事'}}</footer>
      </div>`
  };

  createApp(App).use(router).component('JournalCard', JournalCard).mount('#app');
})();
