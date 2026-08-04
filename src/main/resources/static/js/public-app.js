(function () {
  const { createApp, ref, computed, onMounted, nextTick, watch } = Vue;
  const api = window.TravelApi.public;

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

  function createMap(element, markers, fit) {
    if (!element || !window.L) return null;
    const map = L.map(element, { scrollWheelZoom: false }).setView([30, 110], 3);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(map);
    const points = [];
    markers.forEach(marker => {
      const point = [Number(marker.latitude), Number(marker.longitude)];
      points.push(point);
      const icon = L.divIcon({ className: '', html: '<span style="display:block;width:18px;height:18px;border:4px solid #fff;border-radius:50%;background:#C76D4B;box-shadow:0 2px 8px #69402e66"></span>', iconSize: [18,18] });
      const links = (marker.journals || []).slice(0, 4)
        .map(j => '<a href="#/journals/' + j.slug + '" style="color:#C76D4B;display:block;margin-top:5px">' + j.title + '</a>').join('');
      L.marker(point, { icon }).addTo(map).bindPopup('<b>' + marker.cityName + ' · ' + marker.countryName + '</b><br>' + marker.tripCount + ' 次旅行 · ' + marker.publishedJournalCount + ' 篇日记' + links);
    });
    if (fit && points.length) map.fitBounds(points, { padding: [30, 30], maxZoom: 6 });
    return map;
  }

  const Home = {
    components: { JournalCard },
    setup() {
      const data = ref(null);
      const mapEl = ref(null);
      onMounted(async () => {
        data.value = await api.home();
        await nextTick();
        const markers = await api.cities();
        createMap(mapEl.value, markers, true);
      });
      return { data, mapEl };
    },
    template: `
      <main v-if="data">
        <section class="hero">
          <div class="hero-copy">
            <span class="hero-kicker">PERSONAL TRAVEL JOURNAL</span>
            <h1>把走过的路，<br>写成自己的故事</h1>
            <p>记录城市、光影和旅途中那些不愿忘记的时刻。这里没有攻略排名，只有属于自己的远方。</p>
            <router-link class="primary-btn" to="/trips">浏览旅行日记</router-link>
          </div>
          <div class="hero-photo" v-if="data.recentJournals[0]?.coverUrl" :style="{backgroundImage:'url(' + data.recentJournals[0].coverUrl + ')'}"></div>
          <div v-else class="hero-placeholder">山川 · 城市 · 故事</div>
        </section>
        <div class="page">
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
        await nextTick();
        createMap(mapEl.value, data.value.stops, true);
      });
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
      const html = computed(() => data.value ? DOMPurify.sanitize(marked.parse(data.value.contentMarkdown || '', { breaks: true })) : '');
      onMounted(async () => data.value = await api.journal(route.params.slug));
      return { data, html };
    },
    template: `
      <main v-if="data" class="page article">
        <header class="article-head"><div class="hero-kicker">{{data.journal.tripTitle}} · {{data.journal.cityName || '旅途中'}}</div><h1>{{data.journal.title}}</h1><div class="article-meta">{{data.journal.occurredOn}}</div></header>
        <img v-if="data.journal.coverUrl" class="article-cover" :src="data.journal.coverUrl" :alt="data.journal.title">
        <article class="markdown-body" v-html="html"></article>
        <div v-if="data.media.length" class="gallery"><a v-for="item in data.media" :key="item.id" :href="item.displayUrl" target="_blank"><img :src="item.thumbnailUrl" :alt="item.caption || item.filename"></a></div>
        <nav class="article-nav"><router-link v-if="data.previousSlug" :to="'/journals/'+data.previousSlug">← 上一篇</router-link><span v-else></span><router-link v-if="data.nextSlug" :to="'/journals/'+data.nextSlug">下一篇 →</router-link></nav>
      </main><div v-else class="loading">正在展开日记…</div>`
  };

  const FootprintMap = {
    setup() {
      const mapEl = ref(null); const cities = ref([]);
      onMounted(async () => { cities.value = await api.cities(); await nextTick(); createMap(mapEl.value, cities.value, true); });
      return { mapEl, cities };
    },
    template: `<main class="page"><div class="page-title"><span class="eyebrow">MY FOOTPRINTS</span><h1>足迹地图</h1><p>每一个坐标，都连接着一段已经发生的故事。</p></div>
      <div class="map-panel"><div ref="mapEl" class="map-box" style="height:620px"></div></div>
      <section class="section"><div class="card-grid"><div v-for="city in cities" :key="city.countryName+city.cityName" class="journal-card"><div class="card-body"><h3>{{city.cityName}} · {{city.countryName}}</h3><p>{{city.tripCount}} 次旅行，{{city.publishedJournalCount}} 篇日记</p><div class="card-meta"><span>{{city.firstVisitedOn || '日期未记录'}}</span></div></div></div></div></section>
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
      watch(() => router.currentRoute.value.fullPath, () => menu.value = false);
      return { menu };
    },
    template: `
      <div class="public-shell">
        <header class="public-header"><div class="header-inner"><router-link class="brand" to="/">远行手记</router-link>
          <button class="mobile-menu" @click="menu=!menu">☰</button>
          <nav class="public-nav" :class="{open:menu}"><router-link to="/">首页</router-link><router-link to="/trips">旅行</router-link><router-link to="/journals">日记</router-link><router-link to="/map">足迹地图</router-link></nav>
          <a class="admin-link" href="/admin/" title="管理后台">旅</a>
        </div></header>
        <router-view></router-view>
        <footer class="public-footer">远行手记 · 把走过的路写成自己的故事</footer>
      </div>`
  };

  createApp(App).use(router).component('JournalCard', JournalCard).mount('#app');
})();
