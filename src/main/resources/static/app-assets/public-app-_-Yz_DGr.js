(function(){const{createApp:ee,ref:r,computed:m,onMounted:b,onBeforeUnmount:x,nextTick:M,watch:L}=Vue,f=window.TravelApi.public,j=new URLSearchParams(location.search).has("theme-preview"),C=(e,a)=>window.TravelTheme.apply(e,a);let U=j?"travel-classic":window.TravelTheme.stored(),D=null;function te(e){U=e,D||C(e)}function H(e){D=e,C(e)}function B(){D=null,C(U)}C(U);const E=document.getElementById("app")?.[Symbol.for("travel-journal.public-pages")];if(!E?.JournalCard||!E?.Journals||!E?.Trips)throw new Error("公开站 SFC 页面注册不完整");const O=E.JournalCard;async function N(e,a,t={}){return e?W(e,typeof t=="boolean"?{fit:t}:t,a||[]):null}async function W(e,a,t,l){e.classList.remove("map-load-failed"),e.querySelector(".map-load-message")?.remove();const s=l?{provider:l}:await window.TravelMap.resolveProvider();let i;try{const o=window.TravelTheme?.mapTokens?.()||{};i=await window.TravelMap.create(e,{provider:s.provider,zoom:3,style:o.style})}catch{return ae(e,a,t,s.provider),null}const n=document.createElement("div");n.className="map-zoom-hint",n.textContent="按住 Ctrl + 滚轮缩放地图",e.appendChild(n);const c=o=>{o.ctrlKey&&(o.preventDefault(),o.stopPropagation(),i.zoomBy(o.deltaY<0?1:-1))};e.addEventListener("wheel",c,{passive:!1});const u=[];if((t||[]).filter(o=>Number.isFinite(Number(o.latitude))&&Number.isFinite(Number(o.longitude))&&!(Number(o.latitude)===0&&Number(o.longitude)===0)).forEach((o,y)=>{const w=[Number(o.latitude),Number(o.longitude)];u.push(w);const p=a.route?'<span class="route-marker">'+(y+1)+"</span>":'<span class="city-marker"></span>',v=a.route?[14,14]:[10,10];i.addMarker(w,{html:p,iconAnchor:v,popup:ie(o,y,a.route)})}),a.route&&u.length>1){const o=window.TravelTheme?.mapTokens?.()||{};i.setRoute(u,{color:o.color,width:o.width,dashed:!0,animate:!!o.animateRoute})}if(a.fit&&u.length&&i.fitBounds(u,{padding:[30,30],maxZoom:a.maxZoom||(a.route?11:6)}),requestAnimationFrame(()=>i.invalidateSize()),window.ResizeObserver){const o=new ResizeObserver(()=>i.invalidateSize());o.observe(e);const y=i.destroy.bind(i);i.destroy=()=>{o.disconnect(),e.removeEventListener("wheel",c),y()}}return i}function ae(e,a,t,l){if(!e)return;e.classList.add("map-load-failed");const s=document.createElement("div");s.className="map-load-message";const i=l==="OSM"?"OSM":"高德",n=l==="OSM"?"AMAP":"OSM",c=n==="OSM"?"OSM":"高德",u=document.createElement("p");u.textContent=i+"地图加载失败",s.appendChild(u);const h=document.createElement("button");h.type="button",h.className="map-retry-btn",h.textContent="尝试"+c,h.addEventListener("click",()=>{e.classList.remove("map-load-failed"),s.remove(),W(e,a,t,n)}),s.appendChild(h),e.appendChild(s)}function ie(e,a,t){const l=document.createElement("div");l.className="travel-map-popup";const s=document.createElement("strong");if(s.textContent=(t?a+1+". ":"")+[e.cityName,e.countryName].filter(Boolean).join(" · "),l.appendChild(s),e.formattedAddress){const n=document.createElement("p");n.textContent=e.formattedAddress,l.appendChild(n)}const i=[];if(e.arrivalDate&&i.push(e.arrivalDate+(e.departureDate?" — "+e.departureDate:"")),e.tripCount!=null&&i.push(e.tripCount+" 次旅行"),e.publishedJournalCount!=null&&i.push(e.publishedJournalCount+" 篇日记"),i.length){const n=document.createElement("small");n.textContent=i.join(" · "),l.appendChild(n)}return(e.trips||[]).slice(0,3).forEach(n=>l.appendChild(F("旅行 · "+n.title,"#/trips/"+encodeURIComponent(n.slug)))),(e.journals||[]).slice(0,4).forEach(n=>l.appendChild(F(n.title,"#/journals/"+encodeURIComponent(n.slug)))),l}function F(e,a){const t=document.createElement("a");return t.textContent=e,t.href=a,t}const P={emits:["change"],setup(e,{emit:a}){const t=r(window.TravelMap?.manualProvider()||"AUTO"),l=r(!0),s=r("");window.TravelMap?.runtime?.().then(u=>{l.value=window.TravelMap?.providerUsable?.("AMAP",u)!==!1}).catch(()=>{l.value=!1});function i(){return window.TravelMap?.resolveProvider?.().then(u=>{t.value==="AUTO"&&(s.value=u.provider)}).catch(()=>{t.value==="AUTO"&&(s.value="")})}t.value==="AUTO"&&i();const n=m(()=>"自动"+(s.value?"（"+(s.value==="AMAP"?"高德":"OSM")+"）":""));function c(u){t.value!==u&&(u==="AMAP"&&!l.value||(t.value=u,window.TravelMap?.setManualProvider(u==="AUTO"?null:u),u==="AUTO"&&(s.value="",i()),a("change")))}return{current:t,select:c,autoLabel:n,amapEnabled:l}},template:`<div class="map-provider-switch" role="group" aria-label="地图 Provider">
      <button type="button" :class="{active:current==='AUTO'}" @click="select('AUTO')">{{autoLabel}}</button>
      <button type="button" :class="{active:current==='AMAP'}" :disabled="!amapEnabled" :title="amapEnabled?'':'未配置高德 Web端(JS API) Key'" @click="select('AMAP')">高德</button>
      <button type="button" :class="{active:current==='OSM'}" @click="select('OSM')">OSM</button>
    </div>`},ne={components:{JournalCard:O,MapProviderSwitch:P},setup(){const e=r(null),a=r(null);let t=null,l=0;async function s(){if(!e.value)return;const i=++l;t?.destroy(),t=null;const n=await N(a.value,e.value.cityMarkers||[],!0);i!==l||!a.value?.isConnected?n?.destroy():t=n}return b(async()=>{e.value=await f.home(),await M(),await s()}),x(()=>{l++,t?.destroy(),window.TravelMap?.destroy(a.value)}),{data:e,mapEl:a,renderMap:s}},template:`
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
      <div v-else class="loading">正在翻开旅行手记…</div>`},se=E.Trips,le={components:{JournalCard:O,MapProviderSwitch:P},setup(){const e=VueRouter.useRoute(),a=r(null),t=r(null);let l=null,s=0;async function i(){if(!a.value)return;const n=++s;l?.destroy(),l=null;const c=await N(t.value,a.value.stops,{fit:!0,route:!0,maxZoom:10});n!==s||!t.value?.isConnected?c?.destroy():l=c}return b(async()=>{a.value=await f.trip(e.params.slug),H(a.value.theme),await M(),await i()}),x(()=>{s++,l?.destroy(),window.TravelMap?.destroy(t.value),B()}),{data:a,mapEl:t,renderMap:i}},template:`
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
      </main><div v-else class="loading">正在读取旅行记录…</div>`},oe=E.Journals,q={setup(){const e=VueRouter.useRoute(),a=VueRouter.useRouter(),t=r([]),l=r(null),s=r(!0),i=m(()=>Number(e.params.year)||t.value[0]);async function n(){if(!i.value){s.value=!1;return}s.value=!0;try{l.value=await f.yearReview(i.value)}catch{l.value=null}finally{s.value=!1}}return L(()=>e.params.year,n),b(async()=>{try{t.value=await f.years()}catch{t.value=[]}if(!e.params.year&&t.value.length){a.replace("/years/"+t.value[0]);return}await n()}),{years:t,data:l,loading:s,current:i,go:c=>a.push("/years/"+c)}},template:`<main class="page year-review">
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
    </main>`},Y={props:{preview:{type:Boolean,default:!1}},components:{MapProviderSwitch:P},setup(e){const a=VueRouter.useRoute(),t=r(null),l=r(!1),s=r(null),i=r(null),n=r(0),c=m(()=>t.value?window.JournalBlocks.render(t.value.contentJson,t.value.media):""),u=m(()=>Math.max(1,Math.ceil(window.JournalBlocks.wordCount(t.value?.contentJson)/500))),h=m(()=>i.value?i.value.items[i.value.index]:null);function o(d,g){i.value={items:d,index:Math.max(0,g)}}function y(d){if(!(d.target instanceof HTMLImageElement)||!d.target.matches(window.JournalMedia.MEDIA_SELECTOR))return;const g=window.JournalMedia.groupOf(d.target);o(g.map($=>({src:$.src,caption:$.alt||""})),g.indexOf(d.target))}function w(d){if(!i.value)return;const g=i.value.items.length;i.value.index=(i.value.index+d+g)%g}function p(d){i.value&&(d.key==="Escape"?i.value=null:d.key==="ArrowLeft"?w(-1):d.key==="ArrowRight"&&w(1))}function v(){const d=document.documentElement.scrollHeight-window.innerHeight;n.value=d>0?Math.min(100,Math.max(0,window.scrollY/d*100)):0}const T=r(null),V=r(!1),Z=r(-1);let S=null,J=null,_=!1;const A=m(()=>t.value?.route||[]),z=m(()=>A.value[0]?.source==="moment"),ve=m(()=>z.value?"这一天走过的路":"这一天的安排"),me=m(()=>V.value?"停止回放":z.value?"▶ 回放这一天":"▶ 依次看一遍");async function G(){if(!A.value.length||!T.value||S)return;const d=await N(T.value,[],{});if(_||!d){d?.destroy();return}S=d,J=window.DayRoute?.render(S,A.value,{source:A.value[0]?.source,onState:g=>{V.value=g.playing,Z.value=g.index}})}function he(){J?.play()}function Q(){_=!0,J?.destroy(),J=null,S?.destroy(),S=null,window.TravelMap?.destroy(T.value)}function ge(){Q(),_=!1,G()}const I=[.88,1,1.14,1.3],k=r(Math.min(I.length-1,Math.max(0,Number(localStorage.getItem("travel-journal.reading-scale"))||1))),ye=m(()=>["小","标准","大","特大"][k.value]);function X(){document.documentElement.style.setProperty("--reading-scale",I[k.value])}function we(d){k.value=Math.min(I.length-1,Math.max(0,k.value+d)),localStorage.setItem("travel-journal.reading-scale",String(k.value)),X()}return X(),L(c,()=>M(()=>{window.JournalMedia.teardown(s.value),window.JournalMedia.enhance(s.value)})),b(async()=>{try{t.value=e.preview?await f.preview(a.params.token):await f.journal(a.params.slug)}catch(d){throw l.value=!0,d}H(t.value.theme),window.addEventListener("keydown",p),window.addEventListener("scroll",v,{passive:!0}),M(()=>{v(),window.JournalMedia.enhance(s.value),G()})}),x(()=>{window.JournalMedia.teardown(s.value),window.removeEventListener("keydown",p),window.removeEventListener("scroll",v),Q(),B()}),{data:t,article:s,html:c,lightbox:i,current:h,progress:n,readingMinutes:u,preview:e.preview,previewFailed:l,scaleIndex:k,scaleLabel:ye,scaleMax:I.length-1,stepScale:we,routeEl:T,routePoints:A,routeTitle:ve,routeIsReal:z,replaying:V,replayIndex:Z,replayLabel:me,toggleReplay:he,restartRoute:ge,openLightbox:o,openArticleImage:y,stepLightbox:w}},template:`
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
      <div v-else class="loading">正在展开日记…</div>`},re={components:{MapProviderSwitch:P},setup(){const e=r(null),a=r([]),t=r("全部"),l=r("全部"),s=r("全部"),i=r(!1);let n=null,c=0;const u=m(()=>["全部",...new Set(a.value.map(p=>p.countryName).filter(Boolean))]),h=m(()=>["全部",...new Set(a.value.flatMap(p=>p.visitedYears||[]).map(String))].sort((p,v)=>p==="全部"?-1:Number(v)-Number(p))),o=m(()=>{const p=new Map;return a.value.flatMap(v=>v.trips||[]).forEach(v=>p.set(v.slug,v.title)),[{slug:"全部",title:"全部旅行"},...Array.from(p,([v,T])=>({slug:v,title:T}))]}),y=m(()=>a.value.filter(p=>(t.value==="全部"||p.countryName===t.value)&&(l.value==="全部"||(p.visitedYears||[]).includes(Number(l.value)))&&(s.value==="全部"||(p.trips||[]).some(v=>v.slug===s.value))&&(!i.value||p.publishedJournalCount>0)));async function w(){const p=++c;await M(),n&&(n.destroy(),n=null);const v=await N(e.value,y.value,{fit:!0,maxZoom:7});if(p!==c||!e.value?.isConnected){v?.destroy();return}n=v}return L([t,l,s,i],w),b(async()=>{a.value=await f.cities(),await w()}),x(()=>{n?.destroy(),window.TravelMap?.destroy(e.value)}),{mapEl:e,cities:a,country:t,year:l,trip:s,journalOnly:i,countries:u,years:h,trips:o,filtered:y}},template:`<main class="page"><div class="page-title"><span class="eyebrow">MY FOOTPRINTS</span><h1>足迹地图</h1><p>每一个坐标，都连接着一段已经发生的故事。</p></div>
      <div class="map-filter-bar"><select v-model="country" aria-label="按国家筛选"><option v-for="item in countries" :key="item" :value="item">{{item==='全部'?'全部国家':item}}</option></select><select v-model="year" aria-label="按年份筛选"><option v-for="item in years" :key="item" :value="item">{{item==='全部'?'全部年份':item+' 年'}}</option></select><select v-model="trip" aria-label="按旅行筛选"><option v-for="item in trips" :key="item.slug" :value="item.slug">{{item.title}}</option></select><label><input v-model="journalOnly" type="checkbox"> 仅看有日记的城市</label><span>{{filtered.length}} 个地点</span></div>
      <div class="map-panel"><map-provider-switch @change="render"/><div ref="mapEl" class="map-box" style="height:620px"></div></div>
      <section class="section"><div class="card-grid"><div v-for="city in filtered" :key="city.countryName+city.cityName" class="journal-card"><div class="card-body"><h3>{{city.cityName}} · {{city.countryName}}</h3><p>{{city.tripCount}} 次旅行，{{city.publishedJournalCount}} 篇日记</p><div class="card-meta"><span>{{city.firstVisitedOn || '日期未记录'}}</span></div></div></div></div><div v-if="!filtered.length" class="empty">当前筛选条件下没有足迹。</div></section>
    </main>`},R="data:image/svg+xml;utf8,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#d8cbb4"/><path d="M0 470L230 250l160 150 140-110 370 310H0z" fill="#8da091"/><circle cx="690" cy="150" r="58" fill="#f7e3a1"/></svg>'),ce=["京都的第三个清晨","青城山下的一整天","冰岛公路上的极光","清迈夜市的一碗面","威尼斯的水上巴士","东京深夜的居酒屋"].map((e,a)=>({id:"preview-"+a,slug:"preview",title:e,excerpt:"风景会远去，文字让当时的心情重新回来。这一段还在等待被慢慢写完。",occurredOn:"2026-0"+(a%9+1)+"-12",cityName:["京都","成都","雷克雅未克","清迈","威尼斯","东京"][a],coverUrl:R})),ue={schemaVersion:1,blocks:[{id:"preview-day-opener",type:"day-opener",version:1,title:"",data:{city:"成都",dayLabel:"Day 2",date:"2026-08-10",weather:"晴",route:["成都","都江堰","青城山"],metrics:[{value:"21,430",label:"步"},{value:"¥ 420",label:"花费"}]},settings:{}},{id:"preview-chapter",type:"chapter",version:1,title:"",data:{time:"08:30",title:"清晨出发",note:"从成都出发，一路向西"},settings:{}},{id:"preview-heading",type:"heading",version:1,title:"",data:{text:"都江堰的水声",level:2},settings:{}},{id:"preview-paragraph",type:"paragraph",version:1,title:"",data:{text:"站在鱼嘴分水堤上，能听见很远就传来的水声。两千多年前的工程，到现在还在按原来的方式分水。"},settings:{style:"normal",align:"left"}},{id:"preview-quote",type:"quote",version:1,title:"",data:{text:"有些风景，只有慢下来才看得见。",source:"旅途手记"},settings:{}},{id:"preview-callout",type:"callout",version:1,title:"",data:{tone:"tip",icon:"✦",text:"下午三点后人会少很多，适合拍照。"},settings:{}},{id:"preview-location",type:"location-card",version:1,title:"",data:{name:"青城山",address:"成都市都江堰市青城山镇",hours:"08:00–17:30",cost:"80 元",impression:"树荫很多，山路不算陡，适合慢慢走完一整圈。"},settings:{}},{id:"preview-timeline",type:"timeline",version:1,title:"",data:{items:[{time:"09:30",title:"进入山门",description:"买了一份地图，沿着主路上山"},{time:"11:50",title:"到达上清宫",description:"在这里歇脚吃了午饭"},{time:"15:20",title:"下山回到街子古镇",description:"喝了一下午的茶"}]},settings:{}},{id:"preview-stats",type:"stats",version:1,title:"",data:{items:[{value:"18,642",label:"步"},{value:"12.8 km",label:"路程"},{value:"86",label:"张照片"}]},settings:{}},{id:"preview-image",type:"image",version:1,title:"",data:{previewUrl:R,caption:"山间的一刻"},settings:{}},{id:"preview-gallery",type:"gallery",version:1,title:"",data:{previewUrls:[R,R,R],caption:"这一天拍的照片"},settings:{}},{id:"preview-divider",type:"divider",version:1,title:"",data:{},settings:{}},{id:"preview-day-summary",type:"day-summary",version:1,title:"",data:{items:[{icon:"🌟",label:"今天最喜欢",value:"都江堰的水声"},{icon:"💴",label:"今日花费",value:"¥ 420"}]},settings:{}}]},de=[{order:1,time:"09:00",title:"成都",note:"从市区出发",latitude:30.6598,longitude:104.0633,photos:[]},{order:2,time:"10:30",title:"都江堰",note:"看鱼嘴分水堤",latitude:31.0044,longitude:103.6053,photos:[]},{order:3,time:"12:00",title:"青城山",note:"爬到上清宫",latitude:30.9021,longitude:103.5678,photos:[]},{order:4,time:"17:00",title:"成都",note:"回到市区",latitude:30.6598,longitude:104.0633,photos:[]}],pe=j?[{path:"/:pathMatch(.*)*",component:{components:{JournalCard:O},setup(){const e=new URLSearchParams(location.search).get("scene")||"home",a=["home","journal","map"].includes(e)?e:"home",t=r(null),l=r(null);let s=null,i=null,n=!1;function c(){if(a!=="map")return;const o=window.TravelTheme?.mapTokens?.()||{};s?.setStyle?.(o.style),i?.refreshTheme?.()}function u(){a!=="journal"||!t.value||(window.JournalMedia.teardown(t.value),window.JournalMedia.enhance(t.value))}function h(){c(),u()}return b(async()=>{if(window.addEventListener("travel-theme-applied",h),await M(),a==="journal"&&window.JournalMedia.enhance(t.value),a==="map"){const o=await window.TravelMap.create(l.value,{provider:"OSM",zoom:8,style:window.TravelTheme?.mapTokens?.().style});if(n||!o){o?.destroy();return}s=o,i=window.DayRoute?.render(s,de,{source:"moment"})}}),x(()=>{n=!0,window.removeEventListener("travel-theme-applied",h),window.JournalMedia.teardown(t.value),i?.destroy(),s?.destroy(),window.TravelMap?.destroy(l.value)}),{scene:a,journalArticle:t,mapEl:l,homeJournals:ce,journalHtml:window.JournalBlocks.render(ue,[])}},template:`
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
      </main>`}}]:[{path:"/",component:ne},{path:"/trips",component:se},{path:"/trips/:slug",component:le},{path:"/journals",component:oe},{path:"/journals/:slug",component:Y},{path:"/preview/:token",component:Y,props:{preview:!0}},{path:"/years",component:q},{path:"/years/:year",component:q},{path:"/map",component:re}],K=VueRouter.createRouter({history:VueRouter.createWebHashHistory(),routes:pe,scrollBehavior:()=>({top:0})});ee({setup(){const e=r(!1),a=r({displayName:"旅行者",avatarUrl:null,themeKey:"travel-classic"});L(()=>K.currentRoute.value.fullPath,()=>e.value=!1);function t(n){n&&document.querySelectorAll(n).forEach(c=>{c.classList.remove("tj-preview-highlight"),c.offsetWidth,c.classList.add("tj-preview-highlight"),setTimeout(()=>c.classList.remove("tj-preview-highlight"),900)})}function l(n){n.origin===location.origin&&(n.data?.type==="travel-theme-preview"?C(n.data.theme,{persist:!1}):n.data?.type==="travel-theme-highlight"&&t(n.data.selector))}function s(n){e.value&&!n.target.closest(".public-nav, .mobile-menu")&&(e.value=!1)}function i(n){n.key==="Escape"&&(e.value=!1)}return b(async()=>{if(window.addEventListener("message",l),document.addEventListener("click",s),window.addEventListener("keydown",i),!j)try{a.value=await f.profile(),te(a.value.theme||a.value.themeKey)}catch{}}),x(()=>{window.removeEventListener("message",l),document.removeEventListener("click",s),window.removeEventListener("keydown",i)}),{menu:e,profile:a,isThemePreview:j}},template:`
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
      </div>`}).use(K).component("JournalCard",O).mount("#app")})();
