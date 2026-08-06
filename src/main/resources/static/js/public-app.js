(function () {
  const { createApp, ref, computed, onMounted, onBeforeUnmount, nextTick, watch } = Vue;
  const api = window.TravelApi.public;
  const isThemePreview = new URLSearchParams(location.search).has('theme-preview');
  const applyTheme = (theme,options) => window.TravelTheme.apply(theme,options);
  let siteTheme = window.TravelTheme.stored(), scopedTheme = null;
  function setSiteTheme(theme){siteTheme=theme;if(!scopedTheme)applyTheme(theme);}
  function setScopedTheme(theme){scopedTheme=theme;applyTheme(theme);}
  function clearScopedTheme(){scopedTheme=null;applyTheme(siteTheme);}
  applyTheme(siteTheme);

  const JournalCard = {
    props: ['item'],
    template: `
      <router-link class="journal-card" :to="'/journals/' + item.slug">
        <img v-if="item.coverUrl" class="card-photo" :src="item.coverUrl" :alt="item.title">
        <div v-else class="card-photo placeholder">远行手记</div>
        <div class="card-body">
          <h3>{{ item.title }}</h3>
          <p>{{ item.excerpt || '这段旅程，值得慢慢写下来。' }}</p>
          <div class="card-meta"><span>◷ {{ item.occurredOn }}</span><span>⌖ {{ item.cityName || item.tripTitle }}</span></div>
        </div>
      </router-link>`
  };

  function createMap(element, markers, options = {}) {
    if (!element) return null;
    const settings = typeof options === 'boolean' ? { fit: options } : options;
    if (!window.L) {
      element.innerHTML = '<div class="map-load-message">地图组件加载失败，请刷新页面重试</div>';
      element.classList.add('map-load-failed');
      return null;
    }

    const map = L.map(element, {
      scrollWheelZoom: false,
      tap: true,
      zoomControl: true
    }).setView([30, 110], 3);
    const zoomHint = document.createElement('div');
    zoomHint.className = 'map-zoom-hint';
    zoomHint.textContent = '按住 Ctrl + 滚轮缩放地图';
    element.appendChild(zoomHint);
    const ctrlWheel = event => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      const nextZoom = map.getZoom() + (event.deltaY < 0 ? 1 : -1);
      map.setZoomAround(map.mouseEventToContainerPoint(event), nextZoom);
    };
    element.addEventListener('wheel', ctrlWheel, { passive:false });
    const providers = [
      {
        url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
        subdomains: '1234'
      },
      {
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        subdomains: ''
      }
    ];
    const ResilientTileLayer = L.TileLayer.extend({
      initialize(tileProviders, options) {
        this._tileProviders = tileProviders;
        L.TileLayer.prototype.initialize.call(this, tileProviders[0].url, options);
      },
      createTile(coords, done) {
        const tile = L.DomUtil.create('img', 'leaflet-tile');
        tile.alt = '';
        tile.setAttribute('role', 'presentation');
        let providerIndex = 0;
        let timer = null;
        let finished = false;

        const tryNextProvider = () => {
          clearTimeout(timer);
          if (providerIndex >= this._tileProviders.length) {
            finished = true;
            done(new Error('所有地图瓦片源均加载失败'), tile);
            return;
          }
          const provider = this._tileProviders[providerIndex++];
          const subdomains = provider.subdomains || '';
          const subdomain = subdomains ? subdomains[Math.abs(coords.x + coords.y) % subdomains.length] : '';
          tile.src = L.Util.template(provider.url, {
            s: subdomain,
            x: coords.x,
            y: coords.y,
            z: coords.z
          });
          timer = setTimeout(() => {
            if (!finished) tryNextProvider();
          }, 5000);
        };

        tile.onload = () => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          done(null, tile);
        };
        tile.onerror = () => {
          if (!finished) tryNextProvider();
        };
        tryNextProvider();
        return tile;
      }
    });

    let loadedTiles = 0;
    let failedTiles = 0;
    const tileLayer = new ResilientTileLayer(providers, {
      attribution: '© 高德地图 · © OpenStreetMap contributors',
      maxZoom: 18
    });
    const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 18
    });
    tileLayer.on('tileload', () => {
      loadedTiles += 1;
      element.classList.remove('map-load-failed');
    });
    tileLayer.on('tileerror', () => {
      failedTiles += 1;
      if (!loadedTiles && failedTiles >= 2) element.classList.add('map-load-failed');
    });
    tileLayer.addTo(map);
    L.control.layers({ '高德街道（推荐）': tileLayer, 'OpenStreetMap': osmLayer }, null, { collapsed: true }).addTo(map);
    setTimeout(() => {
      if (!loadedTiles) element.classList.add('map-load-failed');
    }, 11000);

    const points = [];
    const safeMarkers = (markers || []).filter(marker => Number.isFinite(Number(marker.latitude)) && Number.isFinite(Number(marker.longitude)) && !(Number(marker.latitude) === 0 && Number(marker.longitude) === 0));
    safeMarkers.forEach((marker, index) => {
      const point = [Number(marker.latitude), Number(marker.longitude)];
      points.push(point);
      const html = settings.route
        ? '<span class="route-marker">' + (index + 1) + '</span>'
        : '<span class="city-marker"></span>';
      const icon = L.divIcon({ className: 'travel-map-marker', html, iconSize: settings.route ? [28, 28] : [20, 20], iconAnchor: settings.route ? [14, 14] : [10, 10] });
      L.marker(point, { icon }).addTo(map).bindPopup(createPopup(marker, index, settings.route));
    });
    if (settings.route && points.length > 1) L.polyline(points, { color: '#c96f4e', weight: 4, opacity: .8, dashArray: '8 7' }).addTo(map);
    if (settings.fit && points.length) map.fitBounds(points, { padding: [30, 30], maxZoom: settings.maxZoom || (settings.route ? 11 : 6) });
    requestAnimationFrame(() => map.invalidateSize(false));
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => map.invalidateSize(false));
      observer.observe(element);
      map.on('unload', () => observer.disconnect());
    }
    map.on('unload', () => element.removeEventListener('wheel', ctrlWheel));
    return map;
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

  const Home = {
    components: { JournalCard },
    setup() {
      const data = ref(null);
      const mapEl = ref(null);
      onMounted(async () => {
        data.value = await api.home();
        await nextTick();
        createMap(mapEl.value, data.value.cityMarkers || [], true);
      });
      return { data, mapEl };
    },
    template: `
      <main v-if="data" class="home-page-shell">
        <section class="hero">
          <div class="hero-copy">
            <span class="hero-kicker">PERSONAL TRAVEL JOURNAL</span>
            <h1>把走过的路，<br>写成自己的故事</h1>
            <p>记录城市、光影和旅途中那些不愿忘记的时刻。这里没有攻略排名，只有属于自己的远方。</p>
            <router-link class="primary-btn" to="/trips">浏览旅行日记</router-link>
          </div>
          <div class="hero-photo home-hero-photo" role="img" aria-label="京都春日老街与五重塔"></div>
        </section>
        <div class="page home-page">
          <section class="section">
            <div class="section-head"><h2 class="section-title">最近的旅行日记</h2><router-link class="text-link" to="/journals">查看全部 ›</router-link></div>
            <div v-if="data.recentJournals.length" class="card-grid"><journal-card v-for="item in data.recentJournals.slice(0,3)" :key="item.id" :item="item"/></div>
            <div v-else class="empty">第一篇旅行日记，正在等待被写下。</div>
          </section>
          <section class="section map-stats">
            <div class="map-panel"><h2 class="section-title" style="font-size:21px;margin-bottom:18px">我的足迹地图</h2><div ref="mapEl" class="map-box"></div></div>
            <div class="stats-panel">
              <h2 class="section-title" style="font-size:21px;margin-bottom:18px">旅行数据</h2>
              <div class="stats-grid">
                <div class="stat"><strong>{{ data.tripCount }}</strong><span>去过的旅行</span></div>
                <div class="stat"><strong>{{ data.journalCount }}</strong><span>旅行日记</span></div>
                <div class="stat"><strong>{{ data.cityCount }}</strong><span>打卡城市</span></div>
                <div class="stat"><strong>{{ data.photoCount }}</strong><span>旅行照片</span></div>
              </div>
              <p class="quote">“世界很大，而你的故事，值得被记录。”</p>
            </div>
          </section>
        </div>
      </main>
      <div v-else class="loading">正在翻开旅行手记…</div>`
  };

  const Trips = {
    setup() {
      const items = ref([]);
      const year = ref('全部');
      onMounted(async () => items.value = await api.trips());
      const years = computed(() => ['全部', ...new Set(items.value.map(x => String(x.startDate).slice(0,4)))]);
      const filtered = computed(() => year.value === '全部' ? items.value : items.value.filter(x => String(x.startDate).startsWith(year.value)));
      return { items, year, years, filtered };
    },
    template: `
      <main class="page">
        <div class="page-title"><span class="eyebrow">TRAVEL ARCHIVE</span><h1>旅行</h1><p>按照时间整理走过的城市，每一次出发都留下独一无二的章节。</p></div>
        <div class="filter-row"><button v-for="item in years" :key="item" class="chip" :class="{active:year===item}" @click="year=item">{{item}}</button></div>
        <div v-if="filtered.length" class="card-grid">
          <router-link v-for="trip in filtered" :key="trip.id" class="journal-card" :to="'/trips/'+trip.slug">
            <img v-if="trip.coverUrl" class="card-photo" :src="trip.coverUrl"><div v-else class="card-photo placeholder">{{trip.cities[0] || '旅行'}}</div>
            <div class="card-body"><h3>{{trip.title}}</h3><p>{{trip.summary || trip.cities.join(' · ')}}</p>
              <div class="card-meta"><span>{{trip.startDate}} — {{trip.endDate}}</span><span>{{trip.journalCount}} 篇</span></div></div>
          </router-link>
        </div>
        <div v-else class="empty">还没有公开的旅行。</div>
      </main>`
  };

  const TripDetail = {
    components: { JournalCard },
    setup() {
      const route = VueRouter.useRoute();
      const data = ref(null);
      const mapEl = ref(null);
      onMounted(async () => {
        data.value = await api.trip(route.params.slug);
        setScopedTheme(data.value.theme);
        await nextTick();
        createMap(mapEl.value, data.value.stops, { fit:true, route:true, maxZoom:10 });
      });
      onBeforeUnmount(clearScopedTheme);
      return { data, mapEl };
    },
    template: `
      <main v-if="data" class="page">
        <section class="trip-banner">
          <div class="trip-banner-copy"><small>{{data.trip.startDate}} — {{data.trip.endDate}}</small><h1>{{data.trip.title}}</h1><p>{{data.trip.summary}}</p><div>{{data.trip.cities.join(' · ')}}</div></div>
          <img v-if="data.trip.coverUrl" class="trip-banner-photo" :src="data.trip.coverUrl"><div v-else class="hero-placeholder">旅行的章节</div>
        </section>
        <section class="section map-stats">
          <div><div class="section-head"><h2 class="section-title">旅行时间线</h2></div>
            <div class="timeline"><router-link v-for="item in data.journals" :key="item.id" class="timeline-item" :to="'/journals/'+item.slug">
              <small>{{item.occurredOn}} · {{item.cityName || data.trip.title}}</small><h3>{{item.title}}</h3><p>{{item.excerpt}}</p>
            </router-link></div>
          </div>
          <div class="map-panel"><h2 class="section-title" style="font-size:21px;margin-bottom:18px">城市足迹</h2><div ref="mapEl" class="map-box"></div></div>
        </section>
      </main><div v-else class="loading">正在读取旅行记录…</div>`
  };

  const Journals = {
    components: { JournalCard },
    setup() {
      const data = ref(null);
      onMounted(async () => data.value = await api.journals());
      return { data };
    },
    template: `<main class="page"><div class="page-title"><span class="eyebrow">STORIES ON THE ROAD</span><h1>旅行日记</h1><p>风景会远去，文字让当时的心情重新回来。</p></div>
      <div v-if="data?.items?.length" class="card-grid"><journal-card v-for="item in data.items" :key="item.id" :item="item"/></div><div v-else class="empty">还没有公开日记。</div></main>`
  };

  const JournalDetail = {
    setup() {
      const route = VueRouter.useRoute();
      const data = ref(null);
      const lightbox = ref(null);
      const progress = ref(0);
      const html = computed(() => data.value ? DOMPurify.sanitize(marked.parse(data.value.contentMarkdown || '', { breaks: true })) : '');
      const readingMinutes = computed(() => Math.max(1,Math.ceil(String(data.value?.contentMarkdown||'').replace(/<[^>]+>|[#>*_`\[\]()-]/g,'').replace(/\s/g,'').length/500)));
      function openLightbox(src, caption) { lightbox.value = { src, caption: caption || '旅行照片' }; }
      function openArticleImage(event) { if (event.target instanceof HTMLImageElement) openLightbox(event.target.src, event.target.alt); }
      function closeOnEscape(event) { if (event.key === 'Escape') lightbox.value = null; }
      function updateProgress(){const height=document.documentElement.scrollHeight-window.innerHeight;progress.value=height>0?Math.min(100,Math.max(0,window.scrollY/height*100)):0;}
      onMounted(async () => { data.value = await api.journal(route.params.slug);setScopedTheme(data.value.theme); window.addEventListener('keydown', closeOnEscape);window.addEventListener('scroll',updateProgress,{passive:true});nextTick(updateProgress); });
      onBeforeUnmount(() => {window.removeEventListener('keydown', closeOnEscape);window.removeEventListener('scroll',updateProgress);clearScopedTheme();});
      return { data, html, lightbox, progress, readingMinutes, openLightbox, openArticleImage };
    },
    template: `
      <main v-if="data" class="page article">
        <div class="reading-progress" aria-hidden="true"><span :style="{width:progress+'%'}"></span></div>
        <header class="article-head"><div class="hero-kicker">{{data.journal.tripTitle}} · {{data.journal.cityName || '旅途中'}}</div><h1>{{data.journal.title}}</h1><p v-if="data.journal.excerpt" class="article-excerpt">{{data.journal.excerpt}}</p><div class="article-meta">{{data.journal.occurredOn}} · 约 {{readingMinutes}} 分钟阅读</div></header>
        <article class="markdown-body" v-html="html" @click="openArticleImage"></article>
        <div v-if="data.media.length" class="gallery"><button v-for="item in data.media" :key="item.id" type="button" @click="openLightbox(item.displayUrl,item.caption || item.filename)"><img :src="item.thumbnailUrl" :alt="item.caption || item.filename"></button></div>
        <nav class="article-nav"><router-link v-if="data.previousSlug" :to="'/journals/'+data.previousSlug">← 上一篇</router-link><span v-else></span><router-link v-if="data.nextSlug" :to="'/journals/'+data.nextSlug">下一篇 →</router-link></nav>
        <teleport to="body"><div v-if="lightbox" class="photo-lightbox" role="dialog" aria-modal="true" @click.self="lightbox=null"><button type="button" aria-label="关闭大图" @click="lightbox=null">×</button><figure><img :src="lightbox.src" :alt="lightbox.caption"><figcaption>{{lightbox.caption}}</figcaption></figure></div></teleport>
      </main><div v-else class="loading">正在展开日记…</div>`
  };

  const FootprintMap = {
    setup() {
      const mapEl = ref(null),cities=ref([]),country=ref('全部'),year=ref('全部'),trip=ref('全部'),journalOnly=ref(false);
      let map=null;
      const countries=computed(()=>['全部',...new Set(cities.value.map(x=>x.countryName).filter(Boolean))]);
      const years=computed(()=>['全部',...new Set(cities.value.flatMap(x=>x.visitedYears||[]).map(String))].sort((a,b)=>a==='全部'?-1:Number(b)-Number(a)));
      const trips=computed(()=>{const values=new Map();cities.value.flatMap(x=>x.trips||[]).forEach(x=>values.set(x.slug,x.title));return[{slug:'全部',title:'全部旅行'},...Array.from(values,( [slug,title] )=>({slug,title}))];});
      const filtered=computed(()=>cities.value.filter(item=>(country.value==='全部'||item.countryName===country.value)&&(year.value==='全部'||(item.visitedYears||[]).includes(Number(year.value)))&&(trip.value==='全部'||(item.trips||[]).some(x=>x.slug===trip.value))&&(!journalOnly.value||item.publishedJournalCount>0)));
      async function render(){await nextTick();if(map){map.remove();map=null;}map=createMap(mapEl.value,filtered.value,{fit:true,maxZoom:7});}
      watch([country,year,trip,journalOnly],render);
      onMounted(async()=>{cities.value=await api.cities();await render();});
      onBeforeUnmount(()=>map?.remove());
      return {mapEl,cities,country,year,trip,journalOnly,countries,years,trips,filtered};
    },
    template: `<main class="page"><div class="page-title"><span class="eyebrow">MY FOOTPRINTS</span><h1>足迹地图</h1><p>每一个坐标，都连接着一段已经发生的故事。</p></div>
      <div class="map-filter-bar"><select v-model="country" aria-label="按国家筛选"><option v-for="item in countries" :key="item" :value="item">{{item==='全部'?'全部国家':item}}</option></select><select v-model="year" aria-label="按年份筛选"><option v-for="item in years" :key="item" :value="item">{{item==='全部'?'全部年份':item+' 年'}}</option></select><select v-model="trip" aria-label="按旅行筛选"><option v-for="item in trips" :key="item.slug" :value="item.slug">{{item.title}}</option></select><label><input v-model="journalOnly" type="checkbox"> 仅看有日记的城市</label><span>{{filtered.length}} 个地点</span></div>
      <div class="map-panel"><div ref="mapEl" class="map-box" style="height:620px"></div></div>
      <section class="section"><div class="card-grid"><div v-for="city in filtered" :key="city.countryName+city.cityName" class="journal-card"><div class="card-body"><h3>{{city.cityName}} · {{city.countryName}}</h3><p>{{city.tripCount}} 次旅行，{{city.publishedJournalCount}} 篇日记</p><div class="card-meta"><span>{{city.firstVisitedOn || '日期未记录'}}</span></div></div></div></div><div v-if="!filtered.length" class="empty">当前筛选条件下没有足迹。</div></section>
    </main>`
  };

  const routes = [
    { path: '/', component: Home },
    { path: '/trips', component: Trips },
    { path: '/trips/:slug', component: TripDetail },
    { path: '/journals', component: Journals },
    { path: '/journals/:slug', component: JournalDetail },
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
      function previewTheme(event){if(event.origin===location.origin&&event.data?.type==='travel-theme-preview')applyTheme(event.data.theme,{persist:false});}
      onMounted(async () => {
        window.addEventListener('message',previewTheme);
        try {
          profile.value = await api.profile();
          if(!isThemePreview)setSiteTheme(profile.value.theme||profile.value.themeKey);
        } catch (_) { }
      });
      onBeforeUnmount(()=>window.removeEventListener('message',previewTheme));
      return { menu, profile };
    },
    template: `
      <div class="public-shell">
        <header class="public-header"><div class="header-inner"><router-link class="brand" to="/">远行手记</router-link>
          <button class="mobile-menu" type="button" :aria-expanded="menu" aria-label="打开前台导航" @click="menu=!menu">☰</button>
          <nav class="public-nav" :class="{open:menu}"><router-link to="/">首页</router-link><router-link to="/trips">旅行</router-link><router-link to="/journals">日记</router-link><router-link to="/map">足迹地图</router-link></nav>
          <a class="admin-link" href="/admin/" :title="profile.displayName + ' · 管理后台'" aria-label="进入管理后台"><img v-if="profile.avatarUrl" :src="profile.avatarUrl" alt="管理员头像"><span v-else>旅</span></a>
        </div></header>
        <router-view></router-view>
        <footer class="public-footer">远行手记 · 把走过的路写成自己的故事</footer>
      </div>`
  };

  createApp(App).use(router).component('JournalCard', JournalCard).mount('#app');
})();
