import"./pwa-B_j4A_6X.js";(function(){const{createApp:X,ref:o,computed:h,onMounted:b,onBeforeUnmount:x,nextTick:k,watch:E}=Vue,f=window.TravelApi.public,L=new URLSearchParams(location.search).has("theme-preview"),R=(e,t)=>window.TravelTheme.apply(e,t);let J=L?"travel-classic":window.TravelTheme.stored(),I=null;function ee(e){J=e,I||R(e)}function _(e){I=e,R(e)}function z(){I=null,R(J)}R(J);function te(e){if(!e)return null;const t=e.replace(/\/display$/,"");return t===e?null:t+"/thumbnail 480w, "+t+"/medium 768w, "+e+" 1280w"}const j={props:["item"],setup(){return{coverSrcset:te}},template:`
      <router-link class="journal-card" :to="'/journals/' + item.slug">
        <img v-if="item.coverUrl" class="card-photo" :src="item.coverUrl" :srcset="coverSrcset(item.coverUrl)" sizes="(max-width: 700px) 92vw, (max-width: 1100px) 46vw, 31vw" loading="lazy" :alt="item.title">
        <div v-else class="card-photo placeholder">远行手记</div>
        <div class="card-body">
          <h3>{{ item.title }}</h3>
          <p>{{ item.excerpt || '这段旅程，值得慢慢写下来。' }}</p>
          <div class="card-meta"><span>◷ {{ item.occurredOn }}</span><span v-if="item.cityName||item.tripTitle">⌖ {{ item.cityName || item.tripTitle }}</span><span v-else>✎ 独立日记</span></div>
        </div>
      </router-link>`};async function O(e,t,a={}){return e?H(e,typeof a=="boolean"?{fit:a}:a,t||[]):null}async function H(e,t,a,l){e.classList.remove("map-load-failed"),e.querySelector(".map-load-message")?.remove();const n=l?{provider:l}:await window.TravelMap.resolveProvider();let i;try{const r=window.TravelTheme?.mapTokens?.()||{};i=await window.TravelMap.create(e,{provider:n.provider,zoom:3,style:r.style})}catch{return ae(e,t,a,n.provider),null}const s=document.createElement("div");s.className="map-zoom-hint",s.textContent="按住 Ctrl + 滚轮缩放地图",e.appendChild(s);const c=r=>{r.ctrlKey&&(r.preventDefault(),r.stopPropagation(),i.zoomBy(r.deltaY<0?1:-1))};e.addEventListener("wheel",c,{passive:!1});const u=[];if((a||[]).filter(r=>Number.isFinite(Number(r.latitude))&&Number.isFinite(Number(r.longitude))&&!(Number(r.latitude)===0&&Number(r.longitude)===0)).forEach((r,m)=>{const y=[Number(r.latitude),Number(r.longitude)];u.push(y);const p=t.route?'<span class="route-marker">'+(m+1)+"</span>":'<span class="city-marker"></span>',v=t.route?[14,14]:[10,10];i.addMarker(y,{html:p,iconAnchor:v,popup:ie(r,m,t.route)})}),t.route&&u.length>1){const r=window.TravelTheme?.mapTokens?.()||{};i.setRoute(u,{color:r.color,width:r.width,dashed:!0,animate:!!r.animateRoute})}if(t.fit&&u.length&&i.fitBounds(u,{padding:[30,30],maxZoom:t.maxZoom||(t.route?11:6)}),requestAnimationFrame(()=>i.invalidateSize()),window.ResizeObserver){const r=new ResizeObserver(()=>i.invalidateSize());r.observe(e);const m=i.destroy.bind(i);i.destroy=()=>{r.disconnect(),e.removeEventListener("wheel",c),m()}}return i}function ae(e,t,a,l){if(!e)return;e.classList.add("map-load-failed");const n=document.createElement("div");n.className="map-load-message";const i=l==="OSM"?"OSM":"高德",s=l==="OSM"?"AMAP":"OSM",c=s==="OSM"?"OSM":"高德",u=document.createElement("p");u.textContent=i+"地图加载失败",n.appendChild(u);const g=document.createElement("button");g.type="button",g.className="map-retry-btn",g.textContent="尝试"+c,g.addEventListener("click",()=>{e.classList.remove("map-load-failed"),n.remove(),H(e,t,a,s)}),n.appendChild(g),e.appendChild(n)}function ie(e,t,a){const l=document.createElement("div");l.className="travel-map-popup";const n=document.createElement("strong");if(n.textContent=(a?t+1+". ":"")+[e.cityName,e.countryName].filter(Boolean).join(" · "),l.appendChild(n),e.formattedAddress){const s=document.createElement("p");s.textContent=e.formattedAddress,l.appendChild(s)}const i=[];if(e.arrivalDate&&i.push(e.arrivalDate+(e.departureDate?" — "+e.departureDate:"")),e.tripCount!=null&&i.push(e.tripCount+" 次旅行"),e.publishedJournalCount!=null&&i.push(e.publishedJournalCount+" 篇日记"),i.length){const s=document.createElement("small");s.textContent=i.join(" · "),l.appendChild(s)}return(e.trips||[]).slice(0,3).forEach(s=>l.appendChild(W("旅行 · "+s.title,"#/trips/"+encodeURIComponent(s.slug)))),(e.journals||[]).slice(0,4).forEach(s=>l.appendChild(W(s.title,"#/journals/"+encodeURIComponent(s.slug)))),l}function W(e,t){const a=document.createElement("a");return a.textContent=e,a.href=t,a}const N={emits:["change"],setup(e,{emit:t}){const a=o(window.TravelMap?.manualProvider()||"AUTO"),l=o(!0),n=o("");window.TravelMap?.runtime?.().then(u=>{l.value=window.TravelMap?.providerUsable?.("AMAP",u)!==!1}).catch(()=>{l.value=!1});function i(){return window.TravelMap?.resolveProvider?.().then(u=>{a.value==="AUTO"&&(n.value=u.provider)}).catch(()=>{a.value==="AUTO"&&(n.value="")})}a.value==="AUTO"&&i();const s=h(()=>"自动"+(n.value?"（"+(n.value==="AMAP"?"高德":"OSM")+"）":""));function c(u){a.value!==u&&(u==="AMAP"&&!l.value||(a.value=u,window.TravelMap?.setManualProvider(u==="AUTO"?null:u),u==="AUTO"&&(n.value="",i()),t("change")))}return{current:a,select:c,autoLabel:s,amapEnabled:l}},template:`<div class="map-provider-switch" role="group" aria-label="地图 Provider">
      <button type="button" :class="{active:current==='AUTO'}" @click="select('AUTO')">{{autoLabel}}</button>
      <button type="button" :class="{active:current==='AMAP'}" :disabled="!amapEnabled" :title="amapEnabled?'':'未配置高德 Web端(JS API) Key'" @click="select('AMAP')">高德</button>
      <button type="button" :class="{active:current==='OSM'}" @click="select('OSM')">OSM</button>
    </div>`},se={components:{JournalCard:j,MapProviderSwitch:N},setup(){const e=o(null),t=o(null);let a=null,l=0;async function n(){if(!e.value)return;const i=++l;a?.destroy(),a=null;const s=await O(t.value,e.value.cityMarkers||[],!0);i!==l||!t.value?.isConnected?s?.destroy():a=s}return b(async()=>{e.value=await f.home(),await k(),await n()}),x(()=>{l++,a?.destroy(),window.TravelMap?.destroy(t.value)}),{data:e,mapEl:t,renderMap:n}},template:`
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
            <div class="map-panel"><h2 class="section-title" style="font-size:21px;margin-bottom:18px">我的足迹地图</h2><map-provider-switch @change="renderMap"/><div ref="mapEl" class="map-box"></div></div>
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
      <div v-else class="loading">正在翻开旅行手记…</div>`},ne={setup(){const e=o([]),t=o("全部");b(async()=>e.value=await f.trips());const a=h(()=>["全部",...new Set(e.value.map(n=>String(n.startDate).slice(0,4)))]),l=h(()=>t.value==="全部"?e.value:e.value.filter(n=>String(n.startDate).startsWith(t.value)));return{items:e,year:t,years:a,filtered:l}},template:`
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
      </main>`},le={components:{JournalCard:j,MapProviderSwitch:N},setup(){const e=VueRouter.useRoute(),t=o(null),a=o(null);let l=null,n=0;async function i(){if(!t.value)return;const s=++n;l?.destroy(),l=null;const c=await O(a.value,t.value.stops,{fit:!0,route:!0,maxZoom:10});s!==n||!a.value?.isConnected?c?.destroy():l=c}return b(async()=>{t.value=await f.trip(e.params.slug),_(t.value.theme),await k(),await i()}),x(()=>{n++,l?.destroy(),window.TravelMap?.destroy(a.value),z()}),{data:t,mapEl:a,renderMap:i}},template:`
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
          <div class="map-panel"><h2 class="section-title" style="font-size:21px;margin-bottom:18px">城市足迹</h2><map-provider-switch @change="renderMap"/><div ref="mapEl" class="map-box"></div></div>
        </section>
      </main><div v-else class="loading">正在读取旅行记录…</div>`},re={components:{JournalCard:j},setup(){const e=VueRouter.useRoute(),t=VueRouter.useRouter(),a=o(null),l=o([]),n=o(!1),i=o(e.query.q||""),s=h(()=>e.query.tag||"");async function c(){n.value=!0;try{a.value=await f.journals(1,12,e.query.q||void 0,e.query.tag||void 0)}catch{a.value={items:[]}}finally{n.value=!1}}function u(){const m={};i.value.trim()&&(m.q=i.value.trim()),s.value&&(m.tag=s.value),t.push({path:"/journals",query:m})}function g(m){const y={};i.value.trim()&&(y.q=i.value.trim()),m!==s.value&&(y.tag=m),t.push({path:"/journals",query:y})}function r(){i.value="",t.push({path:"/journals"})}return E(()=>e.query,c),b(async()=>{await c();try{l.value=await f.tags()}catch{l.value=[]}}),{data:a,tags:l,loading:n,keyword:i,activeTag:s,search:u,pickTag:g,reset:r}},template:`<main class="page"><div class="page-title"><span class="eyebrow">STORIES ON THE ROAD</span><h1>旅行日记</h1><p>风景会远去，文字让当时的心情重新回来。</p></div>
      <div class="journal-filters">
        <div class="search-box"><input v-model="keyword" type="search" placeholder="搜索标题、摘要或正文…" @keyup.enter="search"><button type="button" @click="search">搜索</button></div>
        <div v-if="tags.length" class="tag-cloud"><button v-for="t in tags" :key="t.slug" type="button" class="tag-chip" :class="{active:activeTag===t.slug}" @click="pickTag(t.slug)">{{t.name}}<i>{{t.journalCount}}</i></button></div>
      </div>
      <div v-if="loading" class="empty">正在查找…</div>
      <div v-else-if="data?.items?.length" class="card-grid"><journal-card v-for="item in data.items" :key="item.id" :item="item"/></div>
      <div v-else class="empty">没有找到匹配的日记。<button type="button" class="text-link-btn" @click="reset">清空筛选</button></div></main>`},B={setup(){const e=VueRouter.useRoute(),t=VueRouter.useRouter(),a=o([]),l=o(null),n=o(!0),i=h(()=>Number(e.params.year)||a.value[0]);async function s(){if(!i.value){n.value=!1;return}n.value=!0;try{l.value=await f.yearReview(i.value)}catch{l.value=null}finally{n.value=!1}}return E(()=>e.params.year,s),b(async()=>{try{a.value=await f.years()}catch{a.value=[]}if(!e.params.year&&a.value.length){t.replace("/years/"+a.value[0]);return}await s()}),{years:a,data:l,loading:n,current:i,go:c=>t.push("/years/"+c)}},template:`<main class="page year-review">
      <div class="page-title"><span class="eyebrow">YEAR IN REVIEW</span><h1>{{current||''}} 年回顾</h1><p>这一年走过的路，和留下的文字。</p></div>
      <div v-if="years.length>1" class="year-switch"><button v-for="y in years" :key="y" type="button" :class="{active:y===current}" @click="go(y)">{{y}}</button></div>
      <div v-if="loading" class="empty">正在统计…</div>
      <template v-else-if="data && data.journalCount">
        <div class="review-grid">
          <div class="review-stat"><strong>{{data.tripCount}}</strong><span>次旅行</span></div>
          <div class="review-stat"><strong>{{data.cityCount}}</strong><span>座城市</span></div>
          <div class="review-stat"><strong>{{data.countryCount}}</strong><span>个国家</span></div>
          <div class="review-stat"><strong>{{data.distanceKm.toLocaleString()}}</strong><span>公里</span></div>
          <div class="review-stat"><strong>{{data.journalCount}}</strong><span>篇日记</span></div>
          <div class="review-stat"><strong>{{data.photoCount}}</strong><span>张照片</span></div>
        </div>
        <p v-if="data.farthestCity" class="review-note">今年走得最远的地方是 <strong>{{data.farthestCity}}</strong>，最长的一次旅行持续了 {{data.longestTripDays}} 天。</p>
        <div v-if="data.trips.length" class="section"><h2 class="section-title">这一年的旅行</h2>
          <ul class="review-trips"><li v-for="t in data.trips" :key="t.slug"><router-link :to="'/trips/'+t.slug">{{t.title}}</router-link><span>{{t.startDate}} — {{t.endDate}} · {{t.cityCount}} 座城市 · {{t.journalCount}} 篇日记</span></li></ul>
        </div>
      </template>
      <div v-else class="empty">{{current||'这'}} 年还没有公开的日记。</div>
    </main>`},F={props:{preview:{type:Boolean,default:!1}},components:{MapProviderSwitch:N},setup(e){const t=VueRouter.useRoute(),a=o(null),l=o(!1),n=o(null),i=o(null),s=o(0),c=h(()=>a.value?window.JournalBlocks.render(a.value.contentJson,a.value.media):""),u=h(()=>Math.max(1,Math.ceil(window.JournalBlocks.wordCount(a.value?.contentJson)/500))),g=h(()=>i.value?i.value.items[i.value.index]:null);function r(d,w){i.value={items:d,index:Math.max(0,w)}}function m(d){if(!(d.target instanceof HTMLImageElement)||!d.target.matches(window.JournalMedia.MEDIA_SELECTOR))return;const w=window.JournalMedia.groupOf(d.target);r(w.map(Q=>({src:Q.src,caption:Q.alt||""})),w.indexOf(d.target))}function y(d){if(!i.value)return;const w=i.value.items.length;i.value.index=(i.value.index+d+w)%w}function p(d){i.value&&(d.key==="Escape"?i.value=null:d.key==="ArrowLeft"?y(-1):d.key==="ArrowRight"&&y(1))}function v(){const d=document.documentElement.scrollHeight-window.innerHeight;s.value=d>0?Math.min(100,Math.max(0,window.scrollY/d*100)):0}const T=o(null),D=o(!1),K=o(-1);let A=null,P=null,V=!1;const C=h(()=>a.value?.route||[]),q=h(()=>C.value[0]?.source==="moment"),ve=h(()=>q.value?"这一天走过的路":"这一天的安排"),me=h(()=>D.value?"停止回放":q.value?"▶ 回放这一天":"▶ 依次看一遍");async function Z(){if(!C.value.length||!T.value||A)return;const d=await O(T.value,[],{});if(V||!d){d?.destroy();return}A=d,P=window.DayRoute?.render(A,C.value,{source:C.value[0]?.source,onState:w=>{D.value=w.playing,K.value=w.index}})}function he(){P?.play()}function G(){V=!0,P?.destroy(),P=null,A?.destroy(),A=null,window.TravelMap?.destroy(T.value)}function ge(){G(),V=!1,Z()}const U=[.88,1,1.14,1.3],M=o(Math.min(U.length-1,Math.max(0,Number(localStorage.getItem("travel-journal.reading-scale"))||1))),ye=h(()=>["小","标准","大","特大"][M.value]);function $(){document.documentElement.style.setProperty("--reading-scale",U[M.value])}function fe(d){M.value=Math.min(U.length-1,Math.max(0,M.value+d)),localStorage.setItem("travel-journal.reading-scale",String(M.value)),$()}return $(),E(c,()=>k(()=>{window.JournalMedia.teardown(n.value),window.JournalMedia.enhance(n.value)})),b(async()=>{try{a.value=e.preview?await f.preview(t.params.token):await f.journal(t.params.slug)}catch(d){throw l.value=!0,d}_(a.value.theme),window.addEventListener("keydown",p),window.addEventListener("scroll",v,{passive:!0}),k(()=>{v(),window.JournalMedia.enhance(n.value),Z()})}),x(()=>{window.JournalMedia.teardown(n.value),window.removeEventListener("keydown",p),window.removeEventListener("scroll",v),G(),z()}),{data:a,article:n,html:c,lightbox:i,current:g,progress:s,readingMinutes:u,preview:e.preview,previewFailed:l,scaleIndex:M,scaleLabel:ye,scaleMax:U.length-1,stepScale:fe,routeEl:T,routePoints:C,routeTitle:ve,routeIsReal:q,replaying:D,replayIndex:K,replayLabel:me,toggleReplay:he,restartRoute:ge,openLightbox:r,openArticleImage:m,stepLightbox:y}},template:`
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
      <div v-else class="loading">正在展开日记…</div>`},oe={components:{MapProviderSwitch:N},setup(){const e=o(null),t=o([]),a=o("全部"),l=o("全部"),n=o("全部"),i=o(!1);let s=null,c=0;const u=h(()=>["全部",...new Set(t.value.map(p=>p.countryName).filter(Boolean))]),g=h(()=>["全部",...new Set(t.value.flatMap(p=>p.visitedYears||[]).map(String))].sort((p,v)=>p==="全部"?-1:Number(v)-Number(p))),r=h(()=>{const p=new Map;return t.value.flatMap(v=>v.trips||[]).forEach(v=>p.set(v.slug,v.title)),[{slug:"全部",title:"全部旅行"},...Array.from(p,([v,T])=>({slug:v,title:T}))]}),m=h(()=>t.value.filter(p=>(a.value==="全部"||p.countryName===a.value)&&(l.value==="全部"||(p.visitedYears||[]).includes(Number(l.value)))&&(n.value==="全部"||(p.trips||[]).some(v=>v.slug===n.value))&&(!i.value||p.publishedJournalCount>0)));async function y(){const p=++c;await k(),s&&(s.destroy(),s=null);const v=await O(e.value,m.value,{fit:!0,maxZoom:7});if(p!==c||!e.value?.isConnected){v?.destroy();return}s=v}return E([a,l,n,i],y),b(async()=>{t.value=await f.cities(),await y()}),x(()=>{s?.destroy(),window.TravelMap?.destroy(e.value)}),{mapEl:e,cities:t,country:a,year:l,trip:n,journalOnly:i,countries:u,years:g,trips:r,filtered:m}},template:`<main class="page"><div class="page-title"><span class="eyebrow">MY FOOTPRINTS</span><h1>足迹地图</h1><p>每一个坐标，都连接着一段已经发生的故事。</p></div>
      <div class="map-filter-bar"><select v-model="country" aria-label="按国家筛选"><option v-for="item in countries" :key="item" :value="item">{{item==='全部'?'全部国家':item}}</option></select><select v-model="year" aria-label="按年份筛选"><option v-for="item in years" :key="item" :value="item">{{item==='全部'?'全部年份':item+' 年'}}</option></select><select v-model="trip" aria-label="按旅行筛选"><option v-for="item in trips" :key="item.slug" :value="item.slug">{{item.title}}</option></select><label><input v-model="journalOnly" type="checkbox"> 仅看有日记的城市</label><span>{{filtered.length}} 个地点</span></div>
      <div class="map-panel"><map-provider-switch @change="render"/><div ref="mapEl" class="map-box" style="height:620px"></div></div>
      <section class="section"><div class="card-grid"><div v-for="city in filtered" :key="city.countryName+city.cityName" class="journal-card"><div class="card-body"><h3>{{city.cityName}} · {{city.countryName}}</h3><p>{{city.tripCount}} 次旅行，{{city.publishedJournalCount}} 篇日记</p><div class="card-meta"><span>{{city.firstVisitedOn || '日期未记录'}}</span></div></div></div></div><div v-if="!filtered.length" class="empty">当前筛选条件下没有足迹。</div></section>
    </main>`},S="data:image/svg+xml;utf8,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#d8cbb4"/><path d="M0 470L230 250l160 150 140-110 370 310H0z" fill="#8da091"/><circle cx="690" cy="150" r="58" fill="#f7e3a1"/></svg>'),ce=["京都的第三个清晨","青城山下的一整天","冰岛公路上的极光","清迈夜市的一碗面","威尼斯的水上巴士","东京深夜的居酒屋"].map((e,t)=>({id:"preview-"+t,slug:"preview",title:e,excerpt:"风景会远去，文字让当时的心情重新回来。这一段还在等待被慢慢写完。",occurredOn:"2026-0"+(t%9+1)+"-12",cityName:["京都","成都","雷克雅未克","清迈","威尼斯","东京"][t],coverUrl:S})),ue={schemaVersion:1,blocks:[{id:"preview-day-opener",type:"day-opener",version:1,title:"",data:{city:"成都",dayLabel:"Day 2",date:"2026-08-10",weather:"晴",route:["成都","都江堰","青城山"],metrics:[{value:"21,430",label:"步"},{value:"¥ 420",label:"花费"}]},settings:{}},{id:"preview-chapter",type:"chapter",version:1,title:"",data:{time:"08:30",title:"清晨出发",note:"从成都出发，一路向西"},settings:{}},{id:"preview-heading",type:"heading",version:1,title:"",data:{text:"都江堰的水声",level:2},settings:{}},{id:"preview-paragraph",type:"paragraph",version:1,title:"",data:{text:"站在鱼嘴分水堤上，能听见很远就传来的水声。两千多年前的工程，到现在还在按原来的方式分水。"},settings:{style:"normal",align:"left"}},{id:"preview-quote",type:"quote",version:1,title:"",data:{text:"有些风景，只有慢下来才看得见。",source:"旅途手记"},settings:{}},{id:"preview-callout",type:"callout",version:1,title:"",data:{tone:"tip",icon:"✦",text:"下午三点后人会少很多，适合拍照。"},settings:{}},{id:"preview-location",type:"location-card",version:1,title:"",data:{name:"青城山",address:"成都市都江堰市青城山镇",hours:"08:00–17:30",cost:"80 元",impression:"树荫很多，山路不算陡，适合慢慢走完一整圈。"},settings:{}},{id:"preview-timeline",type:"timeline",version:1,title:"",data:{items:[{time:"09:30",title:"进入山门",description:"买了一份地图，沿着主路上山"},{time:"11:50",title:"到达上清宫",description:"在这里歇脚吃了午饭"},{time:"15:20",title:"下山回到街子古镇",description:"喝了一下午的茶"}]},settings:{}},{id:"preview-stats",type:"stats",version:1,title:"",data:{items:[{value:"18,642",label:"步"},{value:"12.8 km",label:"路程"},{value:"86",label:"张照片"}]},settings:{}},{id:"preview-image",type:"image",version:1,title:"",data:{previewUrl:S,caption:"山间的一刻"},settings:{}},{id:"preview-gallery",type:"gallery",version:1,title:"",data:{previewUrls:[S,S,S],caption:"这一天拍的照片"},settings:{}},{id:"preview-divider",type:"divider",version:1,title:"",data:{},settings:{}},{id:"preview-day-summary",type:"day-summary",version:1,title:"",data:{items:[{icon:"🌟",label:"今天最喜欢",value:"都江堰的水声"},{icon:"💴",label:"今日花费",value:"¥ 420"}]},settings:{}}]},de=[{order:1,time:"09:00",title:"成都",note:"从市区出发",latitude:30.6598,longitude:104.0633,photos:[]},{order:2,time:"10:30",title:"都江堰",note:"看鱼嘴分水堤",latitude:31.0044,longitude:103.6053,photos:[]},{order:3,time:"12:00",title:"青城山",note:"爬到上清宫",latitude:30.9021,longitude:103.5678,photos:[]},{order:4,time:"17:00",title:"成都",note:"回到市区",latitude:30.6598,longitude:104.0633,photos:[]}],pe=L?[{path:"/:pathMatch(.*)*",component:{components:{JournalCard:j},setup(){const e=new URLSearchParams(location.search).get("scene")||"home",t=["home","journal","map"].includes(e)?e:"home",a=o(null),l=o(null);let n=null,i=null,s=!1;function c(){if(t!=="map")return;const r=window.TravelTheme?.mapTokens?.()||{};n?.setStyle?.(r.style),i?.refreshTheme?.()}function u(){t!=="journal"||!a.value||(window.JournalMedia.teardown(a.value),window.JournalMedia.enhance(a.value))}function g(){c(),u()}return b(async()=>{if(window.addEventListener("travel-theme-applied",g),await k(),t==="journal"&&window.JournalMedia.enhance(a.value),t==="map"){const r=await window.TravelMap.create(l.value,{provider:"OSM",zoom:8,style:window.TravelTheme?.mapTokens?.().style});if(s||!r){r?.destroy();return}n=r,i=window.DayRoute?.render(n,de,{source:"moment"})}}),x(()=>{s=!0,window.removeEventListener("travel-theme-applied",g),window.JournalMedia.teardown(a.value),i?.destroy(),n?.destroy(),window.TravelMap?.destroy(l.value)}),{scene:t,journalArticle:a,mapEl:l,homeJournals:ce,journalHtml:window.JournalBlocks.render(ue,[])}},template:`
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
      </main>`}}]:[{path:"/",component:se},{path:"/trips",component:ne},{path:"/trips/:slug",component:le},{path:"/journals",component:re},{path:"/journals/:slug",component:F},{path:"/preview/:token",component:F,props:{preview:!0}},{path:"/years",component:B},{path:"/years/:year",component:B},{path:"/map",component:oe}],Y=VueRouter.createRouter({history:VueRouter.createWebHashHistory(),routes:pe,scrollBehavior:()=>({top:0})});X({setup(){const e=o(!1),t=o({displayName:"旅行者",avatarUrl:null,themeKey:"travel-classic"});E(()=>Y.currentRoute.value.fullPath,()=>e.value=!1);function a(s){s&&document.querySelectorAll(s).forEach(c=>{c.classList.remove("tj-preview-highlight"),c.offsetWidth,c.classList.add("tj-preview-highlight"),setTimeout(()=>c.classList.remove("tj-preview-highlight"),900)})}function l(s){s.origin===location.origin&&(s.data?.type==="travel-theme-preview"?R(s.data.theme,{persist:!1}):s.data?.type==="travel-theme-highlight"&&a(s.data.selector))}function n(s){e.value&&!s.target.closest(".public-nav, .mobile-menu")&&(e.value=!1)}function i(s){s.key==="Escape"&&(e.value=!1)}return b(async()=>{if(window.addEventListener("message",l),document.addEventListener("click",n),window.addEventListener("keydown",i),!L)try{t.value=await f.profile(),ee(t.value.theme||t.value.themeKey)}catch{}}),x(()=>{window.removeEventListener("message",l),document.removeEventListener("click",n),window.removeEventListener("keydown",i)}),{menu:e,profile:t,isThemePreview:L}},template:`
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
      </div>`}).use(Y).component("JournalCard",j).mount("#app")})();
