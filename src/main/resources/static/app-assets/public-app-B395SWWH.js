(function(){const{createApp:ee,ref:r,computed:m,onMounted:b,onBeforeUnmount:x,nextTick:M,watch:U}=Vue,T=window.TravelApi.public,j=new URLSearchParams(location.search).has("theme-preview"),S=(e,t)=>window.TravelTheme.apply(e,t);let I=j?"travel-classic":window.TravelTheme.stored(),D=null;function te(e){I=e,D||S(e)}function V(e){D=e,S(e)}function B(){D=null,S(I)}S(I);const y=document.getElementById("app")?.[Symbol.for("travel-journal.public-pages")];if(!y?.JournalCard||!y?.Journals||!y?.Trips||!y?.YearReview)throw new Error("公开站 SFC 页面注册不完整");const C=y.JournalCard;async function O(e,t,a={}){return e?F(e,typeof a=="boolean"?{fit:a}:a,t||[]):null}async function F(e,t,a,s){e.classList.remove("map-load-failed"),e.querySelector(".map-load-message")?.remove();const l=s?{provider:s}:await window.TravelMap.resolveProvider();let n;try{const o=window.TravelTheme?.mapTokens?.()||{};n=await window.TravelMap.create(e,{provider:l.provider,zoom:3,style:o.style})}catch{return ae(e,t,a,l.provider),null}const i=document.createElement("div");i.className="map-zoom-hint",i.textContent="按住 Ctrl + 滚轮缩放地图",e.appendChild(i);const u=o=>{o.ctrlKey&&(o.preventDefault(),o.stopPropagation(),n.zoomBy(o.deltaY<0?1:-1))};e.addEventListener("wheel",u,{passive:!1});const c=[];if((a||[]).filter(o=>Number.isFinite(Number(o.latitude))&&Number.isFinite(Number(o.longitude))&&!(Number(o.latitude)===0&&Number(o.longitude)===0)).forEach((o,f)=>{const g=[Number(o.latitude),Number(o.longitude)];c.push(g);const p=t.route?'<span class="route-marker">'+(f+1)+"</span>":'<span class="city-marker"></span>',v=t.route?[14,14]:[10,10];n.addMarker(g,{html:p,iconAnchor:v,popup:ie(o,f,t.route)})}),t.route&&c.length>1){const o=window.TravelTheme?.mapTokens?.()||{};n.setRoute(c,{color:o.color,width:o.width,dashed:!0,animate:!!o.animateRoute})}if(t.fit&&c.length&&n.fitBounds(c,{padding:[30,30],maxZoom:t.maxZoom||(t.route?11:6)}),requestAnimationFrame(()=>n.invalidateSize()),window.ResizeObserver){const o=new ResizeObserver(()=>n.invalidateSize());o.observe(e);const f=n.destroy.bind(n);n.destroy=()=>{o.disconnect(),e.removeEventListener("wheel",u),f()}}return n}function ae(e,t,a,s){if(!e)return;e.classList.add("map-load-failed");const l=document.createElement("div");l.className="map-load-message";const n=s==="OSM"?"OSM":"高德",i=s==="OSM"?"AMAP":"OSM",u=i==="OSM"?"OSM":"高德",c=document.createElement("p");c.textContent=n+"地图加载失败",l.appendChild(c);const h=document.createElement("button");h.type="button",h.className="map-retry-btn",h.textContent="尝试"+u,h.addEventListener("click",()=>{e.classList.remove("map-load-failed"),l.remove(),F(e,t,a,i)}),l.appendChild(h),e.appendChild(l)}function ie(e,t,a){const s=document.createElement("div");s.className="travel-map-popup";const l=document.createElement("strong");if(l.textContent=(a?t+1+". ":"")+[e.cityName,e.countryName].filter(Boolean).join(" · "),s.appendChild(l),e.formattedAddress){const i=document.createElement("p");i.textContent=e.formattedAddress,s.appendChild(i)}const n=[];if(e.arrivalDate&&n.push(e.arrivalDate+(e.departureDate?" — "+e.departureDate:"")),e.tripCount!=null&&n.push(e.tripCount+" 次旅行"),e.publishedJournalCount!=null&&n.push(e.publishedJournalCount+" 篇日记"),n.length){const i=document.createElement("small");i.textContent=n.join(" · "),s.appendChild(i)}return(e.trips||[]).slice(0,3).forEach(i=>s.appendChild(W("旅行 · "+i.title,"#/trips/"+encodeURIComponent(i.slug)))),(e.journals||[]).slice(0,4).forEach(i=>s.appendChild(W(i.title,"#/journals/"+encodeURIComponent(i.slug)))),s}function W(e,t){const a=document.createElement("a");return a.textContent=e,a.href=t,a}const P={emits:["change"],setup(e,{emit:t}){const a=r(window.TravelMap?.manualProvider()||"AUTO"),s=r(!0),l=r("");window.TravelMap?.runtime?.().then(c=>{s.value=window.TravelMap?.providerUsable?.("AMAP",c)!==!1}).catch(()=>{s.value=!1});function n(){return window.TravelMap?.resolveProvider?.().then(c=>{a.value==="AUTO"&&(l.value=c.provider)}).catch(()=>{a.value==="AUTO"&&(l.value="")})}a.value==="AUTO"&&n();const i=m(()=>"自动"+(l.value?"（"+(l.value==="AMAP"?"高德":"OSM")+"）":""));function u(c){a.value!==c&&(c==="AMAP"&&!s.value||(a.value=c,window.TravelMap?.setManualProvider(c==="AUTO"?null:c),c==="AUTO"&&(l.value="",n()),t("change")))}return{current:a,select:u,autoLabel:i,amapEnabled:s}},template:`<div class="map-provider-switch" role="group" aria-label="地图 Provider">
      <button type="button" :class="{active:current==='AUTO'}" @click="select('AUTO')">{{autoLabel}}</button>
      <button type="button" :class="{active:current==='AMAP'}" :disabled="!amapEnabled" :title="amapEnabled?'':'未配置高德 Web端(JS API) Key'" @click="select('AMAP')">高德</button>
      <button type="button" :class="{active:current==='OSM'}" @click="select('OSM')">OSM</button>
    </div>`},ne={components:{JournalCard:C,MapProviderSwitch:P},setup(){const e=r(null),t=r(null);let a=null,s=0;async function l(){if(!e.value)return;const n=++s;a?.destroy(),a=null;const i=await O(t.value,e.value.cityMarkers||[],!0);n!==s||!t.value?.isConnected?i?.destroy():a=i}return b(async()=>{e.value=await T.home(),await M(),await l()}),x(()=>{s++,a?.destroy(),window.TravelMap?.destroy(t.value)}),{data:e,mapEl:t,renderMap:l}},template:`
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
      <div v-else class="loading">正在翻开旅行手记…</div>`},se=y.Trips,le={components:{JournalCard:C,MapProviderSwitch:P},setup(){const e=VueRouter.useRoute(),t=r(null),a=r(null);let s=null,l=0;async function n(){if(!t.value)return;const i=++l;s?.destroy(),s=null;const u=await O(a.value,t.value.stops,{fit:!0,route:!0,maxZoom:10});i!==l||!a.value?.isConnected?u?.destroy():s=u}return b(async()=>{t.value=await T.trip(e.params.slug),V(t.value.theme),await M(),await n()}),x(()=>{l++,s?.destroy(),window.TravelMap?.destroy(a.value),B()}),{data:t,mapEl:a,renderMap:n}},template:`
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
      </main><div v-else class="loading">正在读取旅行记录…</div>`},oe=y.Journals,q=y.YearReview,Y={props:{preview:{type:Boolean,default:!1}},components:{MapProviderSwitch:P},setup(e){const t=VueRouter.useRoute(),a=r(null),s=r(!1),l=r(null),n=r(null),i=r(0),u=m(()=>a.value?window.JournalBlocks.render(a.value.contentJson,a.value.media):""),c=m(()=>Math.max(1,Math.ceil(window.JournalBlocks.wordCount(a.value?.contentJson)/500))),h=m(()=>n.value?n.value.items[n.value.index]:null);function o(d,w){n.value={items:d,index:Math.max(0,w)}}function f(d){if(!(d.target instanceof HTMLImageElement)||!d.target.matches(window.JournalMedia.MEDIA_SELECTOR))return;const w=window.JournalMedia.groupOf(d.target);o(w.map($=>({src:$.src,caption:$.alt||""})),w.indexOf(d.target))}function g(d){if(!n.value)return;const w=n.value.items.length;n.value.index=(n.value.index+d+w)%w}function p(d){n.value&&(d.key==="Escape"?n.value=null:d.key==="ArrowLeft"?g(-1):d.key==="ArrowRight"&&g(1))}function v(){const d=document.documentElement.scrollHeight-window.innerHeight;i.value=d>0?Math.min(100,Math.max(0,window.scrollY/d*100)):0}const E=r(null),z=r(!1),Z=r(-1);let L=null,N=null,H=!1;const R=m(()=>a.value?.route||[]),_=m(()=>R.value[0]?.source==="moment"),ve=m(()=>_.value?"这一天走过的路":"这一天的安排"),me=m(()=>z.value?"停止回放":_.value?"▶ 回放这一天":"▶ 依次看一遍");async function G(){if(!R.value.length||!E.value||L)return;const d=await O(E.value,[],{});if(H||!d){d?.destroy();return}L=d,N=window.DayRoute?.render(L,R.value,{source:R.value[0]?.source,onState:w=>{z.value=w.playing,Z.value=w.index}})}function he(){N?.play()}function Q(){H=!0,N?.destroy(),N=null,L?.destroy(),L=null,window.TravelMap?.destroy(E.value)}function we(){Q(),H=!1,G()}const J=[.88,1,1.14,1.3],k=r(Math.min(J.length-1,Math.max(0,Number(localStorage.getItem("travel-journal.reading-scale"))||1))),fe=m(()=>["小","标准","大","特大"][k.value]);function X(){document.documentElement.style.setProperty("--reading-scale",J[k.value])}function ge(d){k.value=Math.min(J.length-1,Math.max(0,k.value+d)),localStorage.setItem("travel-journal.reading-scale",String(k.value)),X()}return X(),U(u,()=>M(()=>{window.JournalMedia.teardown(l.value),window.JournalMedia.enhance(l.value)})),b(async()=>{try{a.value=e.preview?await T.preview(t.params.token):await T.journal(t.params.slug)}catch(d){throw s.value=!0,d}V(a.value.theme),window.addEventListener("keydown",p),window.addEventListener("scroll",v,{passive:!0}),M(()=>{v(),window.JournalMedia.enhance(l.value),G()})}),x(()=>{window.JournalMedia.teardown(l.value),window.removeEventListener("keydown",p),window.removeEventListener("scroll",v),Q(),B()}),{data:a,article:l,html:u,lightbox:n,current:h,progress:i,readingMinutes:c,preview:e.preview,previewFailed:s,scaleIndex:k,scaleLabel:fe,scaleMax:J.length-1,stepScale:ge,routeEl:E,routePoints:R,routeTitle:ve,routeIsReal:_,replaying:z,replayIndex:Z,replayLabel:me,toggleReplay:he,restartRoute:we,openLightbox:o,openArticleImage:f,stepLightbox:g}},template:`
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
      <div v-else class="loading">正在展开日记…</div>`},re={components:{MapProviderSwitch:P},setup(){const e=r(null),t=r([]),a=r("全部"),s=r("全部"),l=r("全部"),n=r(!1);let i=null,u=0;const c=m(()=>["全部",...new Set(t.value.map(p=>p.countryName).filter(Boolean))]),h=m(()=>["全部",...new Set(t.value.flatMap(p=>p.visitedYears||[]).map(String))].sort((p,v)=>p==="全部"?-1:Number(v)-Number(p))),o=m(()=>{const p=new Map;return t.value.flatMap(v=>v.trips||[]).forEach(v=>p.set(v.slug,v.title)),[{slug:"全部",title:"全部旅行"},...Array.from(p,([v,E])=>({slug:v,title:E}))]}),f=m(()=>t.value.filter(p=>(a.value==="全部"||p.countryName===a.value)&&(s.value==="全部"||(p.visitedYears||[]).includes(Number(s.value)))&&(l.value==="全部"||(p.trips||[]).some(v=>v.slug===l.value))&&(!n.value||p.publishedJournalCount>0)));async function g(){const p=++u;await M(),i&&(i.destroy(),i=null);const v=await O(e.value,f.value,{fit:!0,maxZoom:7});if(p!==u||!e.value?.isConnected){v?.destroy();return}i=v}return U([a,s,l,n],g),b(async()=>{t.value=await T.cities(),await g()}),x(()=>{i?.destroy(),window.TravelMap?.destroy(e.value)}),{mapEl:e,cities:t,country:a,year:s,trip:l,journalOnly:n,countries:c,years:h,trips:o,filtered:f}},template:`<main class="page"><div class="page-title"><span class="eyebrow">MY FOOTPRINTS</span><h1>足迹地图</h1><p>每一个坐标，都连接着一段已经发生的故事。</p></div>
      <div class="map-filter-bar"><select v-model="country" aria-label="按国家筛选"><option v-for="item in countries" :key="item" :value="item">{{item==='全部'?'全部国家':item}}</option></select><select v-model="year" aria-label="按年份筛选"><option v-for="item in years" :key="item" :value="item">{{item==='全部'?'全部年份':item+' 年'}}</option></select><select v-model="trip" aria-label="按旅行筛选"><option v-for="item in trips" :key="item.slug" :value="item.slug">{{item.title}}</option></select><label><input v-model="journalOnly" type="checkbox"> 仅看有日记的城市</label><span>{{filtered.length}} 个地点</span></div>
      <div class="map-panel"><map-provider-switch @change="render"/><div ref="mapEl" class="map-box" style="height:620px"></div></div>
      <section class="section"><div class="card-grid"><div v-for="city in filtered" :key="city.countryName+city.cityName" class="journal-card"><div class="card-body"><h3>{{city.cityName}} · {{city.countryName}}</h3><p>{{city.tripCount}} 次旅行，{{city.publishedJournalCount}} 篇日记</p><div class="card-meta"><span>{{city.firstVisitedOn || '日期未记录'}}</span></div></div></div></div><div v-if="!filtered.length" class="empty">当前筛选条件下没有足迹。</div></section>
    </main>`},A="data:image/svg+xml;utf8,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#d8cbb4"/><path d="M0 470L230 250l160 150 140-110 370 310H0z" fill="#8da091"/><circle cx="690" cy="150" r="58" fill="#f7e3a1"/></svg>'),ce=["京都的第三个清晨","青城山下的一整天","冰岛公路上的极光","清迈夜市的一碗面","威尼斯的水上巴士","东京深夜的居酒屋"].map((e,t)=>({id:"preview-"+t,slug:"preview",title:e,excerpt:"风景会远去，文字让当时的心情重新回来。这一段还在等待被慢慢写完。",occurredOn:"2026-0"+(t%9+1)+"-12",cityName:["京都","成都","雷克雅未克","清迈","威尼斯","东京"][t],coverUrl:A})),de={schemaVersion:1,blocks:[{id:"preview-day-opener",type:"day-opener",version:1,title:"",data:{city:"成都",dayLabel:"Day 2",date:"2026-08-10",weather:"晴",route:["成都","都江堰","青城山"],metrics:[{value:"21,430",label:"步"},{value:"¥ 420",label:"花费"}]},settings:{}},{id:"preview-chapter",type:"chapter",version:1,title:"",data:{time:"08:30",title:"清晨出发",note:"从成都出发，一路向西"},settings:{}},{id:"preview-heading",type:"heading",version:1,title:"",data:{text:"都江堰的水声",level:2},settings:{}},{id:"preview-paragraph",type:"paragraph",version:1,title:"",data:{text:"站在鱼嘴分水堤上，能听见很远就传来的水声。两千多年前的工程，到现在还在按原来的方式分水。"},settings:{style:"normal",align:"left"}},{id:"preview-quote",type:"quote",version:1,title:"",data:{text:"有些风景，只有慢下来才看得见。",source:"旅途手记"},settings:{}},{id:"preview-callout",type:"callout",version:1,title:"",data:{tone:"tip",icon:"✦",text:"下午三点后人会少很多，适合拍照。"},settings:{}},{id:"preview-location",type:"location-card",version:1,title:"",data:{name:"青城山",address:"成都市都江堰市青城山镇",hours:"08:00–17:30",cost:"80 元",impression:"树荫很多，山路不算陡，适合慢慢走完一整圈。"},settings:{}},{id:"preview-timeline",type:"timeline",version:1,title:"",data:{items:[{time:"09:30",title:"进入山门",description:"买了一份地图，沿着主路上山"},{time:"11:50",title:"到达上清宫",description:"在这里歇脚吃了午饭"},{time:"15:20",title:"下山回到街子古镇",description:"喝了一下午的茶"}]},settings:{}},{id:"preview-stats",type:"stats",version:1,title:"",data:{items:[{value:"18,642",label:"步"},{value:"12.8 km",label:"路程"},{value:"86",label:"张照片"}]},settings:{}},{id:"preview-image",type:"image",version:1,title:"",data:{previewUrl:A,caption:"山间的一刻"},settings:{}},{id:"preview-gallery",type:"gallery",version:1,title:"",data:{previewUrls:[A,A,A],caption:"这一天拍的照片"},settings:{}},{id:"preview-divider",type:"divider",version:1,title:"",data:{},settings:{}},{id:"preview-day-summary",type:"day-summary",version:1,title:"",data:{items:[{icon:"🌟",label:"今天最喜欢",value:"都江堰的水声"},{icon:"💴",label:"今日花费",value:"¥ 420"}]},settings:{}}]},ue=[{order:1,time:"09:00",title:"成都",note:"从市区出发",latitude:30.6598,longitude:104.0633,photos:[]},{order:2,time:"10:30",title:"都江堰",note:"看鱼嘴分水堤",latitude:31.0044,longitude:103.6053,photos:[]},{order:3,time:"12:00",title:"青城山",note:"爬到上清宫",latitude:30.9021,longitude:103.5678,photos:[]},{order:4,time:"17:00",title:"成都",note:"回到市区",latitude:30.6598,longitude:104.0633,photos:[]}],pe=j?[{path:"/:pathMatch(.*)*",component:{components:{JournalCard:C},setup(){const e=new URLSearchParams(location.search).get("scene")||"home",t=["home","journal","map"].includes(e)?e:"home",a=r(null),s=r(null);let l=null,n=null,i=!1;function u(){if(t!=="map")return;const o=window.TravelTheme?.mapTokens?.()||{};l?.setStyle?.(o.style),n?.refreshTheme?.()}function c(){t!=="journal"||!a.value||(window.JournalMedia.teardown(a.value),window.JournalMedia.enhance(a.value))}function h(){u(),c()}return b(async()=>{if(window.addEventListener("travel-theme-applied",h),await M(),t==="journal"&&window.JournalMedia.enhance(a.value),t==="map"){const o=await window.TravelMap.create(s.value,{provider:"OSM",zoom:8,style:window.TravelTheme?.mapTokens?.().style});if(i||!o){o?.destroy();return}l=o,n=window.DayRoute?.render(l,ue,{source:"moment"})}}),x(()=>{i=!0,window.removeEventListener("travel-theme-applied",h),window.JournalMedia.teardown(a.value),n?.destroy(),l?.destroy(),window.TravelMap?.destroy(s.value)}),{scene:t,journalArticle:a,mapEl:s,homeJournals:ce,journalHtml:window.JournalBlocks.render(de,[])}},template:`
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
      </main>`}}]:[{path:"/",component:ne},{path:"/trips",component:se},{path:"/trips/:slug",component:le},{path:"/journals",component:oe},{path:"/journals/:slug",component:Y},{path:"/preview/:token",component:Y,props:{preview:!0}},{path:"/years",component:q},{path:"/years/:year",component:q},{path:"/map",component:re}],K=VueRouter.createRouter({history:VueRouter.createWebHashHistory(),routes:pe,scrollBehavior:()=>({top:0})});ee({setup(){const e=r(!1),t=r({displayName:"旅行者",avatarUrl:null,themeKey:"travel-classic"});U(()=>K.currentRoute.value.fullPath,()=>e.value=!1);function a(i){i&&document.querySelectorAll(i).forEach(u=>{u.classList.remove("tj-preview-highlight"),u.offsetWidth,u.classList.add("tj-preview-highlight"),setTimeout(()=>u.classList.remove("tj-preview-highlight"),900)})}function s(i){i.origin===location.origin&&(i.data?.type==="travel-theme-preview"?S(i.data.theme,{persist:!1}):i.data?.type==="travel-theme-highlight"&&a(i.data.selector))}function l(i){e.value&&!i.target.closest(".public-nav, .mobile-menu")&&(e.value=!1)}function n(i){i.key==="Escape"&&(e.value=!1)}return b(async()=>{if(window.addEventListener("message",s),document.addEventListener("click",l),window.addEventListener("keydown",n),!j)try{t.value=await T.profile(),te(t.value.theme||t.value.themeKey)}catch{}}),x(()=>{window.removeEventListener("message",s),document.removeEventListener("click",l),window.removeEventListener("keydown",n)}),{menu:e,profile:t,isThemePreview:j}},template:`
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
      </div>`}).use(K).component("JournalCard",C).mount("#app")})();
