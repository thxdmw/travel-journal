(function () {
  const { createApp, ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } = Vue;
  const api = window.TravelApi;
  const A = api.admin;
  const applyTheme = (theme,options) => window.TravelTheme.apply(theme,options);
  applyTheme(window.TravelTheme.stored());
  const message = text => ElementPlus.ElMessage.success(text);
  const fail = error => ElementPlus.ElMessage.error(error.message || '操作失败');
  const confirm = text => ElementPlus.ElMessageBox.confirm(text, '请确认', { type: 'warning' });
  const tripStatusOptions = [
    { value:'PLANNING', label:'规划中' },
    { value:'ONGOING', label:'旅行中' },
    { value:'COMPLETED', label:'已完成' },
    { value:'ARCHIVED', label:'已归档' }
  ];
  const itineraryTypeOptions = [
    { value:'TRANSPORT', label:'交通' },
    { value:'HOTEL', label:'住宿' },
    { value:'FOOD', label:'餐饮' },
    { value:'ATTRACTION', label:'景点' },
    { value:'SHOPPING', label:'购物' },
    { value:'ACTIVITY', label:'活动' },
    { value:'OTHER', label:'其他' }
  ];
  const journalStatusLabels = { DRAFT:'草稿', PUBLISHED:'已发布' };
  const statusLabel = value => tripStatusOptions.find(item => item.value === value)?.label || journalStatusLabels[value] || value;
  const itineraryTypeLabel = value => itineraryTypeOptions.find(item => item.value === value)?.label || value;

  const session = reactive({ user: null, checked: false });
  async function loadSession() {
    if (session.checked) return session.user;
    try { session.user = await api.auth.session(); if (session.user) { const profile=await api.public.profile();applyTheme(profile.theme||session.user.themeKey); await api.ensureCsrf(); } }
    catch (_) { session.user = null; }
    session.checked = true;
    return session.user;
  }

  const Login = {
    setup() {
      const router = VueRouter.useRouter();
      const form = reactive({ username: 'admin', password: '' });
      const loading = ref(false);
      async function submit() {
        loading.value = true;
        try {
          session.user = await api.auth.login(form);
          session.checked = true;
          const profile=await api.public.profile();applyTheme(profile.theme||session.user.themeKey);
          await api.ensureCsrf();
          router.replace('/');
        } catch (error) { fail(error); }
        finally { loading.value = false; }
      }
      return { form, loading, submit };
    },
    template: `
      <div class="admin-login">
        <section class="login-visual"><h1>远行手记</h1><p>把城市、照片和当时的心情，安静地收进自己的旅行档案。</p></section>
        <section class="login-panel"><div class="login-card"><div class="brand">远行手记</div><h2>欢迎回来</h2><p>登录后继续整理你的旅途。</p>
          <el-form @submit.prevent="submit"><el-form-item><el-input v-model="form.username" size="large" placeholder="用户名"/></el-form-item>
          <el-form-item><el-input v-model="form.password" size="large" type="password" show-password placeholder="密码" @keyup.enter="submit"/></el-form-item>
          <el-button type="primary" size="large" :loading="loading" @click="submit">登录</el-button></el-form>
          <div style="margin-top:24px"><a href="/" style="color:var(--tj-accent)">← 返回公开网站</a></div>
        </div></section>
      </div>`
  };

  const Dashboard = {
    setup() {
      const stats = reactive({ trips:0, drafts:0, published:0, recent:[] });
      onMounted(async () => {
        try {
          const [trips, journals] = await Promise.all([A.trips({ page:1,pageSize:100 }), A.journals({ page:1,pageSize:100 })]);
          stats.trips = trips.total; stats.drafts = journals.items.filter(x => x.status === 'DRAFT').length;
          stats.published = journals.items.filter(x => x.status === 'PUBLISHED').length;
          stats.recent = journals.items.slice(0,6);
        } catch (error) { fail(error); }
      });
      return { stats,statusLabel };
    },
    template: `<div><div class="page-head"><div><h2>管理首页</h2><p>整理旅行计划，也记录旅途之后的故事。</p></div><el-button type="primary" @click="$router.push('/trips')">管理旅行</el-button></div>
      <div class="dashboard-grid"><div class="metric"><span>旅行总数</span><strong>{{stats.trips}}</strong></div><div class="metric"><span>草稿日记</span><strong>{{stats.drafts}}</strong></div><div class="metric"><span>已发布日记</span><strong>{{stats.published}}</strong></div><div class="metric"><span>当前主题</span><strong style="font-size:20px">远行手记</strong></div></div>
      <div class="panel panel-pad"><h3 style="color:var(--tj-primary);font-family:var(--tj-serif)">最近编辑</h3><el-table :data="stats.recent" max-height="calc(100vh - 430px)">
        <el-table-column prop="title" label="日记"/><el-table-column prop="occurredOn" label="日期" width="130"/><el-table-column label="状态" width="100"><template #default="{row}">{{statusLabel(row.status)}}</template></el-table-column>
        <el-table-column width="100"><template #default="{row}"><el-button link type="primary" @click="$router.push('/journals/'+row.id)">编辑</el-button></template></el-table-column>
      </el-table></div></div>`
  };

  const Trips = {
    setup() {
      const data = ref([]), themes=ref([]), loading = ref(false), dialog = ref(false), editing = ref(null), keyword = ref('');
      const form = reactive(blankTrip());
      function blankTrip() { return { title:'',slug:'',summary:'',status:'PLANNING',startDate:'',endDate:'',defaultCurrency:'CNY',coverMediaId:null,internalNote:'',themeKey:null }; }
      async function load() { loading.value=true; try { const result=await Promise.all([A.trips({page:1,pageSize:100,keyword:keyword.value}),A.themes(true)]);data.value=result[0].items;themes.value=result[1]; } catch(e){fail(e);} finally{loading.value=false;} }
      function open(item) { editing.value=item?.id||null; Object.assign(form, item||blankTrip()); dialog.value=true; }
      async function save() { try { if(editing.value) await A.updateTrip(editing.value,form); else await A.createTrip(form); dialog.value=false; message('旅行已保存'); load(); } catch(e){fail(e);} }
      onMounted(load);
      return { data,themes,loading,dialog,editing,keyword,form,load,open,save,tripStatusOptions,statusLabel };
    },
    template: `<div><div class="page-head"><div><h2>旅行管理</h2><p>从计划到完成，集中整理每一次出发。</p></div><el-button type="primary" @click="open()">新建旅行</el-button></div>
      <div class="panel"><div class="toolbar"><el-input v-model="keyword" clearable placeholder="搜索旅行" style="max-width:280px" @keyup.enter="load"/><el-button @click="load">查询</el-button></div>
      <div class="panel-pad"><div v-loading="loading" class="trip-list"><article v-for="item in data" :key="item.id" class="admin-trip-card" @click="$router.push('/trips/'+item.id)">
        <span class="status">{{statusLabel(item.status)}}</span><h3>{{item.title}}</h3><p>{{item.summary||'还没有旅行简介'}}</p><footer><span>{{item.startDate}} — {{item.endDate}}</span><el-button link @click.stop="open(item)">编辑</el-button></footer>
      </article></div><el-empty v-if="!data.length&&!loading" description="还没有旅行"/></div></div>
      <el-dialog v-model="dialog" :title="editing?'编辑旅行':'新建旅行'" width="min(680px,92vw)">
        <el-form label-position="top"><el-form-item label="标题"><el-input v-model="form.title"/></el-form-item>
          <el-form-item label="Slug"><el-input v-model="form.slug" placeholder="japan-2026"/></el-form-item>
          <el-form-item label="简介"><el-input v-model="form.summary" type="textarea" :rows="3"/></el-form-item>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="开始日期"><el-date-picker v-model="form.startDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD"/></el-form-item><el-form-item label="结束日期"><el-date-picker v-model="form.endDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD"/></el-form-item></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="状态"><el-select v-model="form.status"><el-option v-for="x in tripStatusOptions" :key="x.value" :label="x.label" :value="x.value"/></el-select></el-form-item><el-form-item label="币种"><el-input v-model="form.defaultCurrency" maxlength="3"/></el-form-item></div>
          <el-form-item label="旅行专属主题"><el-select v-model="form.themeKey" clearable placeholder="继承全站主题"><el-option v-for="x in themes" :key="x.themeKey" :label="x.name" :value="x.themeKey"/></el-select></el-form-item>
          <el-form-item label="内部备注"><el-input v-model="form.internalNote" type="textarea" :rows="2"/></el-form-item>
        </el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
      </el-dialog></div>`
  };

  const TripWorkspace = {
    setup() {
      const route = VueRouter.useRoute(); const router = VueRouter.useRouter(); const id = Number(route.params.id);
      const trip = ref(null), dashboard=ref(null), stops=ref([]), itinerary=ref([]), budget=ref(null), expenses=ref([]), journals=ref([]);
      const active=ref('overview'), dialog=ref(''), editing=ref(null);
      const mapStatus=ref({searchEnabled:false}),locationKeyword=ref(''),locationResults=ref([]),locationLoading=ref(false),stopMapEl=ref(null);
      const tabOrder=['overview','stops','itinerary','budget','expenses','journals','settings'];
      let tabSwipeStart=null;
      let pickerMap=null,pickerMarker=null;
      const stopForm=reactive(blankStop()), itemForm=reactive(blankItem()), expenseForm=reactive(blankExpense());
      function blankStop(){return{cityName:'',regionName:'',countryName:'中国',countryCode:'CN',latitude:null,longitude:null,placeId:null,formattedAddress:'',adcode:'',coordinateSystem:'GCJ02',locationSource:'MANUAL',arrivalDate:null,departureDate:null,sortOrder:0,note:''};}
      function blankItem(){return{tripStopId:null,itemDate:'',startTime:null,endTime:null,type:'ATTRACTION',title:'',address:'',note:'',plannedCost:0,completed:false,sortOrder:0,allowOutsideTripDates:false};}
      function blankExpense(){return{budgetCategoryId:null,tripStopId:null,expenseDate:'',amount:0,description:'',merchant:'',note:''};}
      async function loadAll(){try{[trip.value,dashboard.value,stops.value,itinerary.value,budget.value,expenses.value]=await Promise.all([A.trip(id),A.dashboard(id),A.stops(id),A.itinerary(id),A.budget(id),A.expenses(id)]);journals.value=(await A.journals({page:1,pageSize:100,tripId:id})).items;}catch(e){fail(e);}}
      async function openStop(row){
        editing.value=row?.id||null;Object.assign(stopForm,blankStop(),row||{});dialog.value='stop';locationKeyword.value=row?.formattedAddress||row?.cityName||'';locationResults.value=[];
        try{mapStatus.value=await A.mapStatus();}catch(_){mapStatus.value={searchEnabled:false};}
        await nextTick();setTimeout(initStopMap,80);
      }
      function closeStop(){editing.value=null;locationResults.value=[];if(pickerMap){pickerMap.remove();pickerMap=null;pickerMarker=null;}}
      function initStopMap(){
        if(!window.L||!stopMapEl.value||pickerMap)return;
        const valid=Number.isFinite(Number(stopForm.latitude))&&Number.isFinite(Number(stopForm.longitude))&&!(Number(stopForm.latitude)===0&&Number(stopForm.longitude)===0);
        const center=valid?[Number(stopForm.latitude),Number(stopForm.longitude)]:[35.4,104.2];
        pickerMap=L.map(stopMapEl.value,{scrollWheelZoom:false,zoomControl:true}).setView(center,valid?11:4);
        L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',{subdomains:'1234',maxZoom:18,attribution:'© 高德地图'}).addTo(pickerMap);
        pickerMap.on('click',event=>pickLocation(event.latlng.lat,event.latlng.lng,true));
        stopMapEl.value.addEventListener('wheel',event=>{if(!event.ctrlKey)return;event.preventDefault();event.stopPropagation();pickerMap.setZoomAround(pickerMap.mouseEventToContainerPoint(event),pickerMap.getZoom()+(event.deltaY<0?1:-1));},{passive:false});
        if(valid)setPickerMarker(center[0],center[1]);
        requestAnimationFrame(()=>pickerMap.invalidateSize(false));
      }
      function setPickerMarker(latitude,longitude){
        if(!pickerMap)return;
        if(!pickerMarker){pickerMarker=L.marker([latitude,longitude],{draggable:true}).addTo(pickerMap);pickerMarker.on('dragend',event=>{const p=event.target.getLatLng();pickLocation(p.lat,p.lng,true);});}
        else pickerMarker.setLatLng([latitude,longitude]);
      }
      function applyLocation(item,move=true){
        stopForm.cityName=item.city||item.name||stopForm.cityName;stopForm.regionName=item.province||item.district||'';stopForm.countryName=item.country||'中国';stopForm.countryCode=item.countryCode||'CN';
        stopForm.latitude=Number(item.latitude);stopForm.longitude=Number(item.longitude);stopForm.placeId=item.placeId||null;stopForm.formattedAddress=item.formattedAddress||item.address||'';stopForm.adcode=item.adcode||'';stopForm.coordinateSystem=item.coordinateSystem||'GCJ02';stopForm.locationSource=item.locationSource||'MAP_PICK';
        setPickerMarker(stopForm.latitude,stopForm.longitude);if(move&&pickerMap)pickerMap.setView([stopForm.latitude,stopForm.longitude],Math.max(pickerMap.getZoom(),12));locationResults.value=[];
      }
      async function pickLocation(latitude,longitude,reverse){
        stopForm.latitude=Number(latitude.toFixed(6));stopForm.longitude=Number(longitude.toFixed(6));stopForm.locationSource='MAP_PICK';stopForm.coordinateSystem='GCJ02';setPickerMarker(stopForm.latitude,stopForm.longitude);
        if(reverse&&mapStatus.value.searchEnabled){try{const item=await A.reverseLocation(stopForm.latitude,stopForm.longitude);applyLocation(item,false);}catch(e){ElementPlus.ElMessage.warning(e.message||'地址识别失败，可继续手动填写');}}
      }
      async function searchLocations(){
        if(!locationKeyword.value.trim())return ElementPlus.ElMessage.warning('请输入城市、景点或地址');
        if(!mapStatus.value.searchEnabled)return ElementPlus.ElMessage.warning('请先在服务端配置 AMAP_WEB_SERVICE_KEY');
        locationLoading.value=true;try{locationResults.value=await A.searchLocations(locationKeyword.value,stopForm.regionName);if(!locationResults.value.length)ElementPlus.ElMessage.info('没有找到匹配地点');}catch(e){fail(e);}finally{locationLoading.value=false;}
      }
      function openItem(row){editing.value=row?.id||null;Object.assign(itemForm,row||blankItem());dialog.value='item';}
      function openExpense(row){editing.value=row?.id||null;Object.assign(expenseForm,row||blankExpense());dialog.value='expense';}
      async function saveStop(){try{editing.value?await A.updateStop(editing.value,stopForm):await A.createStop(id,stopForm);dialog.value='';message('城市已保存');loadAll();}catch(e){fail(e);}}
      async function saveItem(){try{editing.value?await A.updateItinerary(editing.value,itemForm):await A.createItinerary(id,itemForm);dialog.value='';message('行程已保存');loadAll();}catch(e){fail(e);}}
      async function saveExpense(){try{editing.value?await A.updateExpense(editing.value,expenseForm):await A.createExpense(id,expenseForm);dialog.value='';message('支出已保存');loadAll();}catch(e){fail(e);}}
      async function remove(kind,row){try{await confirm('确定删除这条记录吗？');if(kind==='stop')await A.deleteStop(row.id);if(kind==='item')await A.deleteItinerary(row.id);if(kind==='expense')await A.deleteExpense(row.id);message('已删除');loadAll();}catch(e){if(e!=='cancel'&&e!=='close')fail(e);}}
      async function saveCategory(row){try{await A.updateCategory(row.id,{code:row.code,name:row.name,plannedAmount:row.planned,sortOrder:0});message('预算已更新');loadAll();}catch(e){fail(e);}}
      async function removeJournal(row){try{await confirm('确定删除这篇草稿吗？');await A.deleteJournal(row.id);message('草稿已删除');loadAll();}catch(e){if(e!=='cancel'&&e!=='close')fail(e);}}
      function beginTabSwipe(event){
        if(!window.matchMedia('(max-width:760px)').matches||!event.target.closest('.el-tabs__header'))return;
        const touch=event.touches[0];tabSwipeStart={x:touch.clientX,y:touch.clientY};
      }
      function endTabSwipe(event){
        if(!tabSwipeStart)return;
        const touch=event.changedTouches[0],dx=touch.clientX-tabSwipeStart.x,dy=touch.clientY-tabSwipeStart.y;tabSwipeStart=null;
        if(Math.abs(dx)<48||Math.abs(dx)<=Math.abs(dy)*1.2)return;
        const current=tabOrder.indexOf(active.value),next=Math.max(0,Math.min(tabOrder.length-1,current+(dx<0?1:-1)));
        if(next!==current)active.value=tabOrder[next];
      }
      function centerActiveTab(){
        if(!window.matchMedia('(max-width:760px)').matches)return;
        nextTick(()=>document.querySelector('.workspace-tabs .el-tabs__item.is-active')?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}));
      }
      watch(active,centerActiveTab);
      onMounted(()=>{loadAll();centerActiveTab();});
      return {trip,dashboard,stops,itinerary,budget,expenses,journals,active,dialog,editing,stopForm,itemForm,expenseForm,mapStatus,locationKeyword,locationResults,locationLoading,stopMapEl,openStop,closeStop,searchLocations,applyLocation,openItem,openExpense,saveStop,saveItem,saveExpense,remove,saveCategory,removeJournal,beginTabSwipe,endTabSwipe,router,itineraryTypeOptions,statusLabel,itineraryTypeLabel};
    },
    template: `<div v-if="trip"><div class="workspace-head"><span class="back" @click="router.push('/trips')">← 返回</span><div><h2>{{trip.title}}</h2><div class="workspace-meta">{{trip.startDate}} — {{trip.endDate}} · {{statusLabel(trip.status)}}</div></div></div>
      <el-tabs v-model="active" class="workspace-tabs" @touchstart.passive="beginTabSwipe" @touchend.passive="endTabSwipe">
        <el-tab-pane label="概览" name="overview"><div class="dashboard-grid"><div class="metric"><span>城市</span><strong>{{dashboard.stopCount}}</strong></div><div class="metric"><span>行程</span><strong>{{dashboard.itineraryCount}}</strong></div><div class="metric"><span>草稿</span><strong>{{dashboard.draftCount}}</strong></div><div class="metric"><span>已发布</span><strong>{{dashboard.publishedCount}}</strong></div></div><p>{{trip.summary||'还没有旅行简介。'}}</p></el-tab-pane>
        <el-tab-pane label="城市" name="stops"><div class="tab-actions"><el-button type="primary" @click="openStop()">添加城市</el-button></div><el-table :data="stops" max-height="calc(100vh - 360px)"><el-table-column prop="cityName" label="城市"/><el-table-column prop="countryName" label="国家"/><el-table-column prop="arrivalDate" label="到达"/><el-table-column prop="departureDate" label="离开"/><el-table-column label="操作" width="140"><template #default="{row}"><el-button link @click="openStop(row)">编辑</el-button><el-button link type="danger" @click="remove('stop',row)">删除</el-button></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="行程" name="itinerary"><div class="tab-actions"><el-button type="primary" @click="openItem()">添加行程</el-button></div><el-table :data="itinerary" max-height="calc(100vh - 360px)"><el-table-column prop="itemDate" label="日期" width="120"/><el-table-column prop="startTime" label="时间" width="100"/><el-table-column label="类型" width="110"><template #default="{row}">{{itineraryTypeLabel(row.type)}}</template></el-table-column><el-table-column prop="title" label="行程"/><el-table-column label="完成" width="80"><template #default="{row}"><el-checkbox v-model="row.completed" @change="A.completeItinerary(row.id,row.completed)"/></template></el-table-column><el-table-column label="操作" width="140"><template #default="{row}"><el-button link @click="openItem(row)">编辑</el-button><el-button link type="danger" @click="remove('item',row)">删除</el-button></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="预算" name="budget"><div class="budget-summary"><div class="item"><span>总预算</span><strong>{{budget.currency}} {{budget.plannedTotal}}</strong></div><div class="item"><span>已支出</span><strong>{{budget.currency}} {{budget.actualTotal}}</strong></div><div class="item"><span>剩余</span><strong :class="{over:budget.remaining<0}">{{budget.currency}} {{budget.remaining}}</strong></div></div><el-table :data="budget.categories" max-height="calc(100vh - 430px)"><el-table-column prop="name" label="分类"/><el-table-column label="计划金额" min-width="180"><template #default="{row}"><el-input-number class="budget-amount-input" v-model="row.planned" :min="0" :precision="2"/></template></el-table-column><el-table-column prop="actual" label="实际支出"/><el-table-column prop="remaining" label="剩余"/><el-table-column width="90"><template #default="{row}"><el-button link @click="saveCategory(row)">保存</el-button></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="支出" name="expenses"><div class="tab-actions"><el-button type="primary" @click="openExpense()">记录支出</el-button></div><el-table :data="expenses" max-height="calc(100vh - 360px)"><el-table-column prop="expenseDate" label="日期"/><el-table-column prop="description" label="说明"/><el-table-column prop="merchant" label="商户"/><el-table-column prop="amount" label="金额"/><el-table-column label="操作" width="140"><template #default="{row}"><el-button link @click="openExpense(row)">编辑</el-button><el-button link type="danger" @click="remove('expense',row)">删除</el-button></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="日记" name="journals"><div class="tab-actions"><el-button type="primary" @click="router.push('/journals/new?tripId='+trip.id)">新建日记</el-button></div><el-table :data="journals" max-height="calc(100vh - 360px)"><el-table-column prop="title" label="标题"/><el-table-column prop="occurredOn" label="日期"/><el-table-column label="状态"><template #default="{row}">{{statusLabel(row.status)}}</template></el-table-column><el-table-column label="操作" width="150"><template #default="{row}"><el-button link @click="router.push('/journals/'+row.id)">编辑</el-button><el-button link type="danger" @click="removeJournal(row)">删除</el-button></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="设置" name="settings"><el-descriptions border :column="1"><el-descriptions-item label="Slug">{{trip.slug}}</el-descriptions-item><el-descriptions-item label="默认币种">{{trip.defaultCurrency}}</el-descriptions-item><el-descriptions-item label="内部备注">{{trip.internalNote||'无'}}</el-descriptions-item></el-descriptions><el-button style="margin-top:18px" @click="router.push('/themes')">查看主题外观</el-button></el-tab-pane>
      </el-tabs>
      <el-dialog :model-value="dialog==='stop'" class="location-dialog" :title="editing?'编辑地点':'添加地点'" width="min(780px,96vw)" destroy-on-close @closed="closeStop" v-if="dialog==='stop'">
        <div class="location-search"><el-input v-model="locationKeyword" clearable placeholder="搜索城市、景点、酒店或详细地址" @keyup.enter="searchLocations"><template #prepend>地点</template></el-input><el-button type="primary" :loading="locationLoading" @click="searchLocations">搜索</el-button></div>
        <div v-if="!mapStatus.searchEnabled" class="map-config-hint">尚未配置地点搜索；仍可直接点击地图选点或在高级设置中填写坐标。</div>
        <div v-if="locationResults.length" class="location-results"><button v-for="item in locationResults" :key="item.placeId" type="button" @click="applyLocation(item)"><strong>{{item.name}}</strong><span>{{[item.formattedAddress,item.city,item.district].filter(Boolean).join(' · ')}}</span></button></div>
        <div ref="stopMapEl" class="stop-picker-map"><span class="map-picker-tip map-picker-tip-desktop">点击地图选点 · 拖动标记微调 · Ctrl + 滚轮缩放</span><span class="map-picker-tip map-picker-tip-mobile">点击地图选点 · 拖动标记微调</span></div>
        <el-form label-position="top" class="location-form"><div class="form-grid form-grid-2"><el-form-item label="城市 / 地点名称"><el-input v-model="stopForm.cityName"/></el-form-item><el-form-item label="省份 / 区域"><el-input v-model="stopForm.regionName"/></el-form-item></div>
          <el-form-item label="格式化地址"><el-input v-model="stopForm.formattedAddress" placeholder="选择搜索结果后自动填写"/></el-form-item>
          <div class="form-grid form-grid-2"><el-form-item label="到达日期"><el-date-picker v-model="stopForm.arrivalDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择到达日期"/></el-form-item><el-form-item label="离开日期"><el-date-picker v-model="stopForm.departureDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择离开日期"/></el-form-item></div>
          <details class="advanced-location"><summary>高级地点信息</summary><div class="form-grid form-grid-2"><el-form-item label="国家"><el-input v-model="stopForm.countryName"/></el-form-item><el-form-item label="国家代码"><el-input v-model="stopForm.countryCode" maxlength="2"/></el-form-item></div><div class="form-grid form-grid-2"><el-form-item label="纬度"><el-input-number v-model="stopForm.latitude" :precision="6" :controls="false"/></el-form-item><el-form-item label="经度"><el-input-number v-model="stopForm.longitude" :precision="6" :controls="false"/></el-form-item></div><div class="form-grid form-grid-2"><el-form-item label="行政区代码"><el-input v-model="stopForm.adcode"/></el-form-item><el-form-item label="坐标系"><el-select v-model="stopForm.coordinateSystem"><el-option label="高德 GCJ-02" value="GCJ02"/><el-option label="WGS84" value="WGS84"/></el-select></el-form-item></div></details>
          <el-form-item label="备注"><el-input v-model="stopForm.note" type="textarea" :rows="2"/></el-form-item></el-form>
        <template #footer><el-button @click="dialog=''">取消</el-button><el-button type="primary" @click="saveStop">保存地点</el-button></template>
      </el-dialog>
      <el-dialog :model-value="dialog==='item'" :title="editing?'编辑行程':'添加行程'" width="min(650px,92vw)" @closed="editing=null" v-if="dialog==='item'"><el-form label-position="top"><el-form-item label="标题"><el-input v-model="itemForm.title"/></el-form-item><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="日期"><el-date-picker v-model="itemForm.itemDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD"/></el-form-item><el-form-item label="类型"><el-select v-model="itemForm.type"><el-option v-for="x in itineraryTypeOptions" :key="x.value" :label="x.label" :value="x.value"/></el-select></el-form-item></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="开始"><el-time-picker v-model="itemForm.startTime" format="HH时mm分" value-format="HH:mm:ss" placeholder="开始时间"/></el-form-item><el-form-item label="结束"><el-time-picker v-model="itemForm.endTime" format="HH时mm分" value-format="HH:mm:ss" placeholder="结束时间"/></el-form-item></div><el-form-item label="地址"><el-input v-model="itemForm.address"/></el-form-item><el-form-item label="备注"><el-input v-model="itemForm.note" type="textarea"/></el-form-item></el-form><template #footer><el-button @click="dialog=''">取消</el-button><el-button type="primary" @click="saveItem">保存</el-button></template></el-dialog>
      <el-dialog :model-value="dialog==='expense'" :title="editing?'编辑支出':'记录支出'" width="min(600px,92vw)" @closed="editing=null" v-if="dialog==='expense'"><el-form label-position="top"><el-form-item label="说明"><el-input v-model="expenseForm.description"/></el-form-item><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="日期"><el-date-picker v-model="expenseForm.expenseDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD"/></el-form-item><el-form-item label="金额"><el-input-number v-model="expenseForm.amount" :min="0.01" :precision="2"/></el-form-item></div><el-form-item label="分类"><el-select v-model="expenseForm.budgetCategoryId"><el-option v-for="x in budget.categories" :key="x.id" :label="x.name" :value="x.id"/></el-select></el-form-item><el-form-item label="商户"><el-input v-model="expenseForm.merchant"/></el-form-item><el-form-item label="备注"><el-input v-model="expenseForm.note" type="textarea"/></el-form><template #footer><el-button @click="dialog=''">取消</el-button><el-button type="primary" @click="saveExpense">保存</el-button></template></el-dialog>
    </div><div v-else style="padding:80px;text-align:center">正在打开旅行工作台…</div>`
  };

  const JournalEditor = {
    setup() {
      const route=VueRouter.useRoute(),router=VueRouter.useRouter(), id=ref(route.params.id==='new'?null:Number(route.params.id));
      const trips=ref([]),stops=ref([]),media=ref([]),templates=ref([]),themes=ref([]),uploading=ref(false),saving=ref(false),dirty=ref(false),fileInput=ref(null),textarea=ref(null);
      const templateDialog=ref(false),selectedTemplate=ref(null),templateData=ref({}),generating=ref(false),imageDialog=ref(false),mobilePane=ref('write'),mobileMetaCollapsed=ref(false);
      const imageForm=reactive({item:null,size:'medium',align:'center',caption:''});
      const form=reactive({tripId:route.query.tripId?Number(route.query.tripId):null,tripStopId:null,title:'',slug:'',excerpt:'',contentMarkdown:'',occurredOn:'',coverMediaId:null,status:'DRAFT',themeKey:null,templateId:null,templateVersion:null,templateData:null,templateSnapshot:null,templateDetached:false});
      const html=computed(()=>DOMPurify.sanitize(marked.parse(form.contentMarkdown||'',{breaks:true})));
      const wordCount=computed(()=>String(form.contentMarkdown||'').replace(/<[^>]+>|[#>*_`\[\]()-]/g,'').replace(/\s/g,'').length);
      const templateBlocks=computed(()=>selectedTemplate.value?.definitionJson?.blocks||[]);
      async function load(){try{[trips.value,templates.value,themes.value]=await Promise.all([(await A.trips({page:1,pageSize:100})).items,A.templates(true),A.themes(true)]);if(id.value){Object.assign(form,await A.journal(id.value));media.value=await A.media(id.value);}if(form.tripId)stops.value=await A.stops(form.tripId);if(form.templateId){selectedTemplate.value=templates.value.find(x=>x.id===form.templateId)||{id:form.templateId,name:'日记所用模板',definitionJson:form.templateSnapshot};templateData.value=form.templateData||{};}dirty.value=false;}catch(e){fail(e);}}
      watch(()=>form.tripId,async value=>{if(value)stops.value=await A.stops(value);});
      watch(form,()=>dirty.value=true,{deep:true});
      async function save(silent=false){saving.value=true;try{const body={tripId:form.tripId,tripStopId:form.tripStopId,title:form.title,slug:form.slug,excerpt:form.excerpt,contentMarkdown:form.contentMarkdown,occurredOn:form.occurredOn,coverMediaId:form.coverMediaId,themeKey:form.themeKey,templateId:form.templateId,templateVersion:form.templateVersion,templateData:form.templateData,templateSnapshot:form.templateSnapshot,templateDetached:form.templateDetached};if(id.value)await A.updateJournal(id.value,body);else{const created=await A.createJournal(body);id.value=created.id;form.status=created.status;router.replace('/journals/'+created.id);}dirty.value=false;if(!silent)message('草稿已保存');return true;}catch(e){fail(e);return false;}finally{saving.value=false;}}
      async function publish(){try{if(!await save(true))return;await A.publishJournal(id.value);form.status='PUBLISHED';message('日记已发布');}catch(e){fail(e);}}
      async function unpublish(){try{await A.unpublishJournal(id.value);form.status='DRAFT';message('日记已撤回');}catch(e){fail(e);}}
      async function upload(file){if(!id.value){ElementPlus.ElMessage.warning('请先保存草稿，再上传图片');return;}uploading.value=true;try{const fd=new FormData();fd.append('file',file);const item=await A.uploadMedia(id.value,fd);media.value.push(item);insertImage(item);message('图片已上传，可以设置版式后插入');}catch(e){fail(e);}finally{uploading.value=false;}}
      function choose(){fileInput.value.click();}
      function picked(event){const file=event.target.files[0];if(file)upload(file);event.target.value='';}
      function onPaste(event){const file=Array.from(event.clipboardData?.files||[]).find(x=>x.type.startsWith('image/'));if(file){event.preventDefault();upload(file);}}
      function dropped(event){const file=Array.from(event.dataTransfer?.files||[]).find(x=>x.type.startsWith('image/'));if(file)upload(file);}
      function insertImage(item){imageForm.item=item;imageForm.size=item.height>item.width?'small':'medium';imageForm.align='center';imageForm.caption=item.caption||item.filename||'';imageDialog.value=true;}
      function confirmImage(){if(!imageForm.item)return;const caption=escapeHtml(imageForm.caption);const syntax='\n<figure class="journal-figure journal-figure--'+imageForm.size+' journal-figure--'+imageForm.align+'">\n  <img src="'+imageForm.item.displayUrl+'" alt="'+caption+'" loading="lazy">\n'+(caption?'  <figcaption>'+caption+'</figcaption>\n':'')+'</figure>\n';insertAtCursor(syntax);imageDialog.value=false;mobilePane.value='write';}
      function insertAtCursor(syntax){const el=textarea.value?.$el?.querySelector('textarea');if(!el){form.contentMarkdown+=syntax;return;}const start=el.selectionStart??form.contentMarkdown.length,end=el.selectionEnd??start;form.contentMarkdown=form.contentMarkdown.slice(0,start)+syntax+form.contentMarkdown.slice(end);nextTick(()=>{el.focus();el.selectionStart=el.selectionEnd=start+syntax.length;});}
      function insertFormat(before,after,placeholder){const el=textarea.value?.$el?.querySelector('textarea');const start=el?.selectionStart??form.contentMarkdown.length,end=el?.selectionEnd??start,selected=form.contentMarkdown.slice(start,end)||placeholder;insertAtCursor(before+selected+(after||''));}
      function escapeHtml(value){return String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
      async function setCover(item){try{await A.setCover(id.value,item.id);form.coverMediaId=item.id;message('已设为封面');}catch(e){fail(e);}}
      async function removeMedia(item){try{await confirm('确定删除这张图片吗？');await A.deleteMedia(item.relationId);media.value=media.value.filter(x=>x.relationId!==item.relationId);message('图片已删除');}catch(e){if(e!=='cancel'&&e!=='close')fail(e);}}
      function defaultBlockData(block){if(block.type==='trip-info')return{weather:'',mood:''};if(block.type==='image')return{mediaIds:null};if(block.type==='gallery')return{mediaIds:[]};if(block.type==='rating')return{value:0};return{value:''};}
      function selectTemplate(item){selectedTemplate.value=item;const values={};(item.definitionJson?.blocks||[]).forEach(block=>values[block.id]=defaultBlockData(block));templateData.value=values;}
      function openTemplate(){templateDialog.value=true;if(!selectedTemplate.value&&templates.value.length)selectTemplate(templates.value[0]);}
      async function generateFromTemplate(){
        if(!selectedTemplate.value)return ElementPlus.ElMessage.warning('请选择模板');
        if(!form.tripId||!form.occurredOn)return ElementPlus.ElMessage.warning('请先选择旅行和发生日期');
        if(form.contentMarkdown.trim()){try{await confirm('生成模板内容会替换当前正文，是否继续？');}catch(e){return;}}
        generating.value=true;try{const result=await A.generateTemplate(selectedTemplate.value.id,{journalId:id.value,tripId:form.tripId,tripStopId:form.tripStopId,occurredOn:form.occurredOn,data:templateData.value});form.contentMarkdown=result.markdown;form.templateId=result.templateId;form.templateVersion=result.templateVersion;form.templateData=result.data;form.templateSnapshot=result.snapshot;form.templateDetached=false;if(!form.title){const city=stops.value.find(x=>x.id===form.tripStopId)?.cityName;form.title=[city,selectedTemplate.value.name].filter(Boolean).join(' · ');}if(!form.slug)form.slug='journal-'+form.occurredOn.replaceAll('-','')+'-'+Date.now().toString().slice(-5);templateDialog.value=false;mobilePane.value='write';message('模板已生成，可以继续润色');}catch(e){fail(e);}finally{generating.value=false;}
      }
      function markDetached(){if(form.templateId)form.templateDetached=true;}
      function backToTrip(){router.push(form.tripId?'/trips/'+form.tripId:'/trips');}
      function beforeUnload(e){if(dirty.value){e.preventDefault();e.returnValue='';}}
      onMounted(()=>{load();window.addEventListener('beforeunload',beforeUnload);});onBeforeUnmount(()=>window.removeEventListener('beforeunload',beforeUnload));
      return{form,trips,stops,media,templates,themes,html,wordCount,id,uploading,saving,fileInput,textarea,templateDialog,selectedTemplate,templateData,templateBlocks,generating,imageDialog,imageForm,mobilePane,mobileMetaCollapsed,save,publish,unpublish,choose,picked,onPaste,dropped,insertImage,confirmImage,insertFormat,setCover,removeMedia,selectTemplate,openTemplate,generateFromTemplate,markDetached,backToTrip,statusLabel};
    },
    template: `<div class="editor-page"><div class="editor-top"><el-button link @click="backToTrip">← 返回</el-button><h2>编辑旅行日记</h2><span class="status">{{statusLabel(form.status)}}</span><span class="word-count">{{wordCount}} 字</span><div class="editor-actions"><el-button @click="openTemplate">{{form.templateId?'填写模板':'从模板开始'}}</el-button><el-button :loading="saving" @click="save()">保存草稿</el-button><el-button v-if="form.status==='PUBLISHED'" @click="unpublish">撤回</el-button><el-button type="primary" @click="publish">发布日记</el-button></div></div>
      <button type="button" class="editor-meta-toggle" :aria-expanded="!mobileMetaCollapsed" @click="mobileMetaCollapsed=!mobileMetaCollapsed"><span>{{mobileMetaCollapsed?(form.title||'日记信息'):'收起日记信息'}}</span><span aria-hidden="true">{{mobileMetaCollapsed?'⌄':'⌃'}}</span></button>
      <div class="editor-meta-group" :class="{collapsed:mobileMetaCollapsed}"><div class="editor-meta"><el-input v-model="form.title" placeholder="日记标题"/><el-select v-model="form.tripId" placeholder="所属旅行"><el-option v-for="x in trips" :key="x.id" :label="x.title" :value="x.id"/></el-select><el-select v-model="form.tripStopId" clearable placeholder="城市"><el-option v-for="x in stops" :key="x.id" :label="x.cityName" :value="x.id"/></el-select><el-date-picker v-model="form.occurredOn" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="发生日期"/></div>
      <div class="editor-meta editor-meta-secondary"><el-input v-model="form.slug" placeholder="slug，例如 tokyo-spring"/><el-input v-model="form.excerpt" placeholder="摘要"/><el-select v-model="form.themeKey" clearable placeholder="继承旅行 / 全站主题"><el-option v-for="x in themes" :key="x.themeKey" :label="x.name" :value="x.themeKey"/></el-select></div>
      <div v-if="form.templateId" class="template-state" :class="{detached:form.templateDetached}"><span>{{form.templateDetached?'正文已自由修改，不会自动覆盖':'正文仍与模板填写数据关联'}}</span><button type="button" @click="openTemplate">继续填写模板</button></div></div>
      <div class="editor-mobile-tabs"><button type="button" :class="{active:mobilePane==='write'}" @click="mobilePane='write'">写作</button><button type="button" :class="{active:mobilePane==='preview'}" @click="mobilePane='preview'">预览</button><button type="button" :class="{active:mobilePane==='media'}" @click="mobilePane='media'">图片</button></div>
      <div class="editor-grid"><section class="editor-column" :class="{'mobile-active':mobilePane==='write'}"><div class="editor-label">Markdown 编辑 <small>支持粘贴图片</small></div><div class="writing-toolbar"><button type="button" @click="insertFormat('## ','','小标题')">H2</button><button type="button" @click="insertFormat('**','**','重点文字')">粗体</button><button type="button" @click="insertFormat('> ','','此刻想说的话')">引用</button><button type="button" @click="insertFormat('- ','','清单内容')">清单</button><button type="button" @click="insertFormat('\\n---\\n','','')">分隔线</button></div><el-input ref="textarea" class="markdown-input" v-model="form.contentMarkdown" type="textarea" @input="markDetached" @paste="onPaste"/></section>
        <section class="editor-column" :class="{'mobile-active':mobilePane==='preview'}"><div class="editor-label">实时预览</div><article class="preview markdown-body" v-html="html"></article></section>
        <aside class="editor-column" :class="{'mobile-active':mobilePane==='media'}"><div class="editor-label">图片管理</div><div class="media-side"><div class="upload-box" @click="choose" @drop.prevent="dropped" @dragover.prevent><span v-if="!uploading">选择、拖拽或粘贴图片<br><small>JPEG / PNG / WebP</small></span><span v-else>正在上传…</span></div><input ref="fileInput" hidden type="file" accept="image/jpeg,image/png,image/webp" @change="picked">
          <div v-for="item in media" :key="item.id" class="media-item"><img :src="item.thumbnailUrl"><div><small>{{item.filename}}</small><div><el-button link size="small" @click="insertImage(item)">插入</el-button><el-button link size="small" @click="setCover(item)">{{form.coverMediaId===item.id?'当前封面':'设封面'}}</el-button><el-button link type="danger" size="small" @click="removeMedia(item)">删除</el-button></div></div></div>
        </div></aside></div>
      <el-dialog v-model="imageDialog" title="设置图片版式" width="min(560px,94vw)" class="image-layout-dialog"><div v-if="imageForm.item" class="image-layout-body"><img :src="imageForm.item.thumbnailUrl" :alt="imageForm.caption"><el-form label-position="top"><el-form-item label="图片说明"><el-input v-model="imageForm.caption" placeholder="这张照片背后的故事"/></el-form-item><el-form-item label="展示大小"><el-radio-group v-model="imageForm.size"><el-radio-button value="small">小</el-radio-button><el-radio-button value="medium">中</el-radio-button><el-radio-button value="large">大</el-radio-button><el-radio-button value="full">通栏</el-radio-button></el-radio-group></el-form-item><el-form-item label="对齐方式"><el-radio-group v-model="imageForm.align"><el-radio-button value="left">居左</el-radio-button><el-radio-button value="center">居中</el-radio-button><el-radio-button value="right">居右</el-radio-button></el-radio-group></el-form-item></el-form></div><template #footer><el-button @click="imageDialog=false">取消</el-button><el-button type="primary" @click="confirmImage">插入正文</el-button></template></el-dialog>
      <el-dialog v-model="templateDialog" title="用模板开始写作" width="min(980px,96vw)" class="template-writing-dialog"><div class="template-writing"><aside class="template-choices"><button v-for="item in templates" :key="item.id" type="button" :class="{active:selectedTemplate?.id===item.id}" @click="selectTemplate(item)"><strong>{{item.name}}</strong><span>{{item.description}}</span><small>{{item.builtin?'系统模板':'我的模板'}}</small></button></aside><section v-if="selectedTemplate" class="template-fields"><header><h3>{{selectedTemplate.name}}</h3><p>旅行、路线、行程和支出会自动读取；你只需写下只有自己知道的感受。</p></header><div v-for="block in templateBlocks" :key="block.id" class="template-field"><template v-if="block.type==='trip-info'"><label>{{block.title}}</label><div class="form-grid form-grid-2"><el-input v-model="templateData[block.id].weather" placeholder="天气，例如 晴 / 海风"/><el-input v-model="templateData[block.id].mood" placeholder="心情，例如 松弛 / 惊喜"/></div></template><template v-else-if="['text','textarea','quote'].includes(block.type)"><label>{{block.title}} <em v-if="block.required">必填</em></label><el-input v-model="templateData[block.id].value" :type="block.type==='text'?'text':'textarea'" :rows="block.type==='text'?1:4" :placeholder="block.config?.placeholder||'写下这一段'"/></template><template v-else-if="block.type==='rating'"><label>{{block.title}}</label><el-rate v-model="templateData[block.id].value" :max="block.config?.max||5" show-text/></template><template v-else-if="block.type==='image'"><label>{{block.title}}</label><el-select v-model="templateData[block.id].mediaIds" clearable placeholder="选择一张已上传图片"><el-option v-for="item in media" :key="item.id" :label="item.caption||item.filename" :value="item.id"/></el-select><small v-if="!media.length">先保存草稿并上传图片，之后可回来补充。</small></template><template v-else-if="block.type==='gallery'"><label>{{block.title}}</label><el-select v-model="templateData[block.id].mediaIds" multiple collapse-tags placeholder="选择已上传图片"><el-option v-for="item in media" :key="item.id" :label="item.caption||item.filename" :value="item.id"/></el-select><small v-if="!media.length">先保存草稿并上传图片，之后可回来补充。</small></template><div v-else class="template-auto-block"><strong>{{block.title}}</strong><span>将从当前旅行数据自动整理</span></div></div></section></div><template #footer><el-button @click="templateDialog=false">取消</el-button><el-button type="primary" :loading="generating" @click="generateFromTemplate">生成日记正文</el-button></template></el-dialog>
    </div>`
  };

  const TemplateManager = {
    setup() {
      const items=ref([]),loading=ref(false),dialog=ref(false),editing=ref(null);
      const blockTypes=[
        {value:'trip-info',label:'旅行信息'},{value:'text',label:'单行文字'},{value:'textarea',label:'长文字'},{value:'quote',label:'引用'},
        {value:'rating',label:'评分'},{value:'checklist',label:'清单'},{value:'route',label:'路线'},{value:'itinerary',label:'行程'},
        {value:'expense-summary',label:'花费汇总'},{value:'image',label:'单图'},{value:'gallery',label:'照片墙'},{value:'divider',label:'分隔线'}
      ];
      const form=reactive({name:'',description:'',category:'CUSTOM',enabled:true,definitionJson:{title:'',blocks:[]}});
      async function load(){loading.value=true;try{items.value=await A.templates(false);}catch(e){fail(e);}finally{loading.value=false;}}
      function reset(){editing.value=null;Object.assign(form,{name:'',description:'',category:'CUSTOM',enabled:true,definitionJson:{title:'',blocks:[]}});}
      function create(){reset();dialog.value=true;}
      function edit(item){editing.value=item.id;Object.assign(form,{name:item.name,description:item.description||'',category:item.category||'CUSTOM',enabled:item.enabled,definitionJson:JSON.parse(JSON.stringify(item.definitionJson))});dialog.value=true;}
      function blockLabel(type){return blockTypes.find(x=>x.value===type)?.label||type;}
      function addBlock(type){const label=blockLabel(type),config={};if(['text','textarea','quote'].includes(type))config.placeholder='写下这一段';if(['image','gallery'].includes(type)){config.imageSize='medium';config.align='center';}if(type==='rating')config.max=5;if(type==='route')config.source='itinerary';if(type==='expense-summary')config.source='expense';form.definitionJson.blocks.push({id:'block_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,5),type,title:label,required:false,config});}
      function move(index,offset){const target=index+offset;if(target<0||target>=form.definitionJson.blocks.length)return;const [block]=form.definitionJson.blocks.splice(index,1);form.definitionJson.blocks.splice(target,0,block);}
      function copyBlock(index){const source=form.definitionJson.blocks[index],copy=JSON.parse(JSON.stringify(source));copy.id='block_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,5);copy.title+=' 副本';form.definitionJson.blocks.splice(index+1,0,copy);}
      async function save(){if(!form.definitionJson.blocks.length)return ElementPlus.ElMessage.warning('请至少添加一个区块');try{const body={name:form.name,description:form.description,category:form.category,enabled:form.enabled,definitionJson:{title:form.name,blocks:form.definitionJson.blocks}};editing.value?await A.updateTemplate(editing.value,body):await A.createTemplate(body);dialog.value=false;message('模板已保存');load();}catch(e){fail(e);}}
      async function duplicate(item){try{const copy=await A.duplicateTemplate(item.id);message('已复制为“'+copy.name+'”');load();}catch(e){fail(e);}}
      async function remove(item){try{await confirm('确定删除模板“'+item.name+'”吗？');await A.deleteTemplate(item.id);message('模板已删除');load();}catch(e){if(e!=='cancel'&&e!=='close')fail(e);}}
      onMounted(load);
      return{items,loading,dialog,editing,form,blockTypes,load,create,edit,blockLabel,addBlock,move,copyBlock,save,duplicate,remove};
    },
    template:`<div><div class="page-head"><div><h2>日记模板</h2><p>把常写的结构保存下来，下次只填当时的天气、心情和故事。</p></div><el-button type="primary" @click="create">新建我的模板</el-button></div>
      <div v-loading="loading" class="template-card-grid"><article v-for="item in items" :key="item.id" class="panel template-card"><header><span>{{item.builtin?'系统模板':'我的模板'}}</span><small>第 {{item.version}} 版</small></header><h3>{{item.name}}</h3><p>{{item.description||'还没有模板说明'}}</p><div class="template-block-tags"><i v-for="block in item.definitionJson.blocks.slice(0,6)" :key="block.id">{{block.title||blockLabel(block.type)}}</i></div><footer><el-button link @click="duplicate(item)">复制</el-button><template v-if="!item.builtin"><el-button link type="primary" @click="edit(item)">编辑</el-button><el-button link type="danger" @click="remove(item)">删除</el-button></template></footer></article></div>
      <el-dialog v-model="dialog" :title="editing?'编辑我的模板':'新建我的模板'" width="min(920px,96vw)" class="template-editor-dialog"><el-form label-position="top"><div class="form-grid form-grid-2"><el-form-item label="模板名称"><el-input v-model="form.name" maxlength="120" placeholder="例如：海边慢游的一天"/></el-form-item><el-form-item label="是否启用"><el-switch v-model="form.enabled" active-text="启用" inactive-text="停用"/></el-form-item></div><el-form-item label="模板说明"><el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" show-word-limit/></el-form-item></el-form>
        <div class="block-library"><span>添加区块</span><button v-for="type in blockTypes" :key="type.value" type="button" @click="addBlock(type.value)">＋ {{type.label}}</button></div>
        <div class="template-builder"><el-empty v-if="!form.definitionJson.blocks.length" description="从上方添加第一个区块"/><article v-for="(block,index) in form.definitionJson.blocks" :key="block.id" class="template-block-editor"><div class="block-order"><button type="button" :disabled="index===0" @click="move(index,-1)">↑</button><strong>{{index+1}}</strong><button type="button" :disabled="index===form.definitionJson.blocks.length-1" @click="move(index,1)">↓</button></div><div class="block-fields"><div class="form-grid form-grid-2"><el-input v-model="block.title" placeholder="区块标题"><template #prepend>{{blockLabel(block.type)}}</template></el-input><el-switch v-model="block.required" active-text="必填" inactive-text="选填"/></div><el-input v-if="['text','textarea','quote'].includes(block.type)" v-model="block.config.placeholder" placeholder="填写提示语"/><div v-if="['image','gallery'].includes(block.type)" class="form-grid form-grid-2"><el-select v-model="block.config.imageSize"><el-option label="小图" value="small"/><el-option label="中图" value="medium"/><el-option label="大图" value="large"/><el-option label="通栏" value="full"/></el-select><el-select v-model="block.config.align"><el-option label="居左" value="left"/><el-option label="居中" value="center"/><el-option label="居右" value="right"/></el-select></div></div><div class="block-actions"><button type="button" @click="copyBlock(index)">复制</button><button type="button" class="danger" @click="form.definitionJson.blocks.splice(index,1)">删除</button></div></article></div>
        <template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存模板</el-button></template></el-dialog>
    </div>`
  };

  const Profile = {
    setup() {
      const avatarInput = ref(null);
      const uploading = ref(false);
      const changingPassword = ref(false);
      const password = reactive({ currentPassword:'', newPassword:'', confirmPassword:'' });
      const avatarUrl = computed(() => session.user?.avatarUrl);

      function chooseAvatar() { avatarInput.value?.click(); }
      async function picked(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        uploading.value = true;
        try {
          const form = new FormData();
          form.append('file', file);
          const updated = await api.auth.uploadAvatar(form);
          session.user = { ...session.user, ...updated };
          message('头像已更新');
        } catch (error) { fail(error); }
        finally {
          uploading.value = false;
          event.target.value = '';
        }
      }
      async function changePassword() {
        if (password.newPassword.length < 8) return fail(new Error('新密码至少需要 8 位'));
        if (password.newPassword !== password.confirmPassword) return fail(new Error('两次输入的新密码不一致'));
        changingPassword.value = true;
        try {
          await api.auth.changePassword({
            currentPassword: password.currentPassword,
            newPassword: password.newPassword
          });
          password.currentPassword = '';
          password.newPassword = '';
          password.confirmPassword = '';
          message('密码修改成功');
        } catch (error) { fail(error); }
        finally { changingPassword.value = false; }
      }
      return { session, avatarInput, avatarUrl, uploading, password, changingPassword, chooseAvatar, picked, changePassword };
    },
    template: `
      <div><div class="page-head"><div><h2>个人资料</h2><p>管理登录密码和网站展示头像。</p></div></div>
        <div class="profile-grid">
          <section class="panel panel-pad profile-card"><h3>头像</h3>
            <div class="profile-avatar"><img v-if="avatarUrl" :src="avatarUrl" alt="管理员头像"><span v-else>{{session.user?.displayName?.slice(0,1) || '旅'}}</span></div>
            <div><strong>{{session.user?.displayName}}</strong><p>{{session.user?.username}}</p></div>
            <el-button type="primary" :loading="uploading" @click="chooseAvatar">上传新头像</el-button>
            <input ref="avatarInput" hidden type="file" accept="image/jpeg,image/png,image/webp" @change="picked">
            <small>支持 JPEG、PNG、WebP，最大 5MB；上传后前台头像会同步更新。</small>
          </section>
          <section class="panel panel-pad password-card"><h3>修改密码</h3>
            <el-form label-position="top" @submit.prevent="changePassword">
              <el-form-item label="当前密码"><el-input v-model="password.currentPassword" type="password" show-password autocomplete="current-password"/></el-form-item>
              <el-form-item label="新密码"><el-input v-model="password.newPassword" type="password" show-password autocomplete="new-password" placeholder="至少 8 位"/></el-form-item>
              <el-form-item label="确认新密码"><el-input v-model="password.confirmPassword" type="password" show-password autocomplete="new-password"/></el-form-item>
              <el-button type="primary" :loading="changingPassword" @click="changePassword">确认修改</el-button>
            </el-form>
          </section>
        </div>
      </div>`
  };

  const Theme = {
    setup() {
      const themes=ref([]),changing=ref(''),saving=ref(false),editor=ref(false),editing=ref(null),previewFrame=ref(null),previewMode=ref('desktop'),importInput=ref(null);
      const history=ref([]),historyIndex=ref(-1);
      let historyTimer=null,restoring=false,originalSnapshot='';
      const colorFields=[['background','页面背景'],['surface','内容背景'],['surfaceSoft','柔和背景'],['primary','主要文字'],['primarySoft','次级主色'],['accent','强调操作'],['accentHover','强调悬停'],['sand','装饰沙色'],['text','正文颜色'],['muted','弱化文字'],['border','边框颜色'],['danger','危险提示']];
      const defaultDefinition={colors:{background:'#F7F2E8',surface:'#FFFCF6',surfaceSoft:'#F1E7D7',primary:'#264A3D',primarySoft:'#42685A',accent:'#C76D4B',accentHover:'#B65B3B',sand:'#DFC9A8',text:'#2A2D2B',muted:'#77736B',border:'#E6DAC8',danger:'#B7483E'},typography:{headingFamily:'serif',bodyFamily:'sans',bodySize:16,lineHeight:1.8},shape:{cardRadius:12,imageRadius:8,buttonRadius:8},layout:{contentWidth:1200,articleWidth:760,density:'comfortable',homeLayout:'editorial'},image:{style:'natural',shadow:'soft',defaultRatio:'16:9'},motion:{level:'subtle'}};
      const form=reactive({name:'',description:'',baseThemeKey:'travel-classic',previewImageUrl:'',enabled:true,definitionJson:JSON.parse(JSON.stringify(defaultDefinition))});
      const contrast=computed(()=>{const ratio=contrastRatio(form.definitionJson.colors.text,form.definitionJson.colors.background);return{ratio:ratio.toFixed(2),ok:ratio>=4.5};});
      const canUndo=computed(()=>historyIndex.value>0),canRedo=computed(()=>historyIndex.value<history.value.length-1);
      function deep(value){return JSON.parse(JSON.stringify(value));}
      function completeDefinition(input){const result=deep(defaultDefinition);Object.keys(result).forEach(section=>Object.assign(result[section],input?.[section]||{}));return result;}
      async function load(){try{themes.value=await A.themes(false);}catch(e){fail(e);}}
      async function selectTheme(item) {
        if (session.user?.themeKey === item.themeKey) return;
        changing.value = item.themeKey;
        try {
          const updated = await api.auth.changeTheme(item.themeKey);
          session.user = { ...session.user, ...updated };
          applyTheme(item);
          message('主题已切换为“' + item.name + '”');
        } catch (error) { fail(error); }
        finally { changing.value = ''; }
      }
      function snapshot(){return JSON.stringify({name:form.name,description:form.description,baseThemeKey:form.baseThemeKey,previewImageUrl:form.previewImageUrl,enabled:form.enabled,definitionJson:form.definitionJson});}
      function assignSnapshot(value){restoring=true;const data=typeof value==='string'?JSON.parse(value):value;form.name=data.name;form.description=data.description||'';form.baseThemeKey=data.baseThemeKey||'travel-classic';form.previewImageUrl=data.previewImageUrl||'';form.enabled=data.enabled!==false;form.definitionJson=completeDefinition(data.definitionJson);nextTick(()=>{restoring=false;postPreview();});}
      function seedHistory(){originalSnapshot=snapshot();history.value=[originalSnapshot];historyIndex.value=0;}
      function pushHistory(){const value=snapshot();if(value===history.value[historyIndex.value])return;history.value=history.value.slice(0,historyIndex.value+1);history.value.push(value);if(history.value.length>30)history.value.shift();historyIndex.value=history.value.length-1;}
      function undo(){if(!canUndo.value)return;historyIndex.value--;assignSnapshot(history.value[historyIndex.value]);}
      function redo(){if(!canRedo.value)return;historyIndex.value++;assignSnapshot(history.value[historyIndex.value]);}
      function resetEditor(){assignSnapshot(originalSnapshot);history.value=[originalSnapshot];historyIndex.value=0;}
      function openEditor(item,forceNew=false){const source=item||themes.value.find(x=>x.themeKey===session.user?.themeKey)||themes.value[0];editing.value=forceNew||source?.builtin?null:source?.id||null;assignSnapshot({name:forceNew?'我的旅行主题':source?.name||'我的旅行主题',description:source?.description||'',baseThemeKey:source?.baseThemeKey||'travel-classic',previewImageUrl:source?.previewImageUrl||'',enabled:true,definitionJson:source?.definitionJson||defaultDefinition});editor.value=true;nextTick(()=>{seedHistory();postPreview();});}
      async function duplicateTheme(item){try{const created=await A.duplicateTheme(item.id);await load();openEditor(created,false);message('已复制主题，可以开始设计');}catch(e){fail(e);}}
      async function saveTheme(){saving.value=true;try{const body={name:form.name,description:form.description,baseThemeKey:form.baseThemeKey,previewImageUrl:form.previewImageUrl||null,enabled:form.enabled,definitionJson:form.definitionJson};const saved=editing.value?await A.updateTheme(editing.value,body):await A.createTheme(body);if(session.user?.themeKey===saved.themeKey)applyTheme(saved);editor.value=false;await load();message('主题已保存');}catch(e){fail(e);}finally{saving.value=false;}}
      async function removeTheme(item){try{await confirm('确定删除主题“'+item.name+'”吗？');await A.deleteTheme(item.id);await load();message('主题已删除');}catch(e){if(e!=='cancel'&&e!=='close')fail(e);}}
      function postPreview(){nextTick(()=>previewFrame.value?.contentWindow?.postMessage({type:'travel-theme-preview',theme:{themeKey:'preview',baseThemeKey:form.baseThemeKey,definitionJson:deep(form.definitionJson)}},location.origin));}
      function exportTheme(item){const payload={schemaVersion:1,name:item.name,description:item.description,baseThemeKey:item.baseThemeKey,previewImageUrl:item.previewImageUrl,definitionJson:item.definitionJson};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=item.themeKey+'.json';link.click();URL.revokeObjectURL(link.href);}
      function chooseImport(){importInput.value.click();}
      async function imported(event){const file=event.target.files[0];event.target.value='';if(!file)return;try{const data=JSON.parse(await file.text());if(!data.definitionJson)throw new Error('文件中缺少 definitionJson');assignSnapshot({name:(data.name||'导入的主题')+' · 导入',description:data.description||'',baseThemeKey:data.baseThemeKey||'travel-classic',previewImageUrl:data.previewImageUrl||'',enabled:true,definitionJson:data.definitionJson});editing.value=null;editor.value=true;nextTick(()=>{seedHistory();postPreview();});}catch(e){fail(new Error('导入失败：'+e.message));}}
      function luminance(hex){const values=String(hex).replace('#','').match(/.{2}/g)?.map(x=>parseInt(x,16)/255)||[0,0,0];return values.map(x=>x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4)).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);}
      function contrastRatio(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
      watch(form,()=>{postPreview();if(restoring||!editor.value)return;clearTimeout(historyTimer);historyTimer=setTimeout(pushHistory,280);},{deep:true});
      onMounted(load);
      onBeforeUnmount(()=>clearTimeout(historyTimer));
      return {session,themes,changing,editor,editing,previewFrame,previewMode,importInput,form,colorFields,contrast,canUndo,canRedo,selectTheme,openEditor,duplicateTheme,saveTheme,removeTheme,postPreview,exportTheme,chooseImport,imported,undo,redo,resetEditor};
    },
    template: `<div><div class="page-head"><div><h2>主题外观</h2><p>选择预设，或设计自己的色彩、字体、布局与图片风格；公开网站会同步更新。</p></div><div class="theme-page-actions"><input ref="importInput" type="file" accept="application/json" hidden @change="imported"><el-button @click="chooseImport">导入 JSON</el-button><el-button type="primary" @click="openEditor(null,true)">新建设计</el-button></div></div>
      <div class="theme-grid"><article v-for="item in themes" :key="item.themeKey" class="panel theme-preview" :class="{selected:session.user?.themeKey===item.themeKey}">
        <img :src="item.previewImageUrl||'/img/theme-travel-classic-preview.png'" :alt="item.name"><div class="theme-info"><div><div class="theme-card-title"><h3>{{item.name}}</h3><small>{{item.builtin?'系统预设':'我的主题'}} · v{{item.version}}</small></div><p>{{item.description}}</p></div><span v-if="session.user?.themeKey===item.themeKey" class="theme-badge">当前主题</span></div>
        <footer class="theme-card-actions"><el-button v-if="session.user?.themeKey!==item.themeKey" type="primary" :loading="changing===item.themeKey" @click="selectTheme(item)">使用</el-button><el-button v-if="!item.builtin" @click="openEditor(item)">设计</el-button><el-button @click="duplicateTheme(item)">复制</el-button><el-button @click="exportTheme(item)">导出</el-button><el-button v-if="!item.builtin" type="danger" link @click="removeTheme(item)">删除</el-button></footer>
      </article></div>
      <el-dialog v-model="editor" class="theme-designer-dialog" :title="editing?'设计主题':'新建主题'" width="min(1240px,97vw)" destroy-on-close>
        <div class="theme-designer"><section class="theme-controls"><div class="theme-history"><el-button size="small" :disabled="!canUndo" @click="undo">撤销</el-button><el-button size="small" :disabled="!canRedo" @click="redo">重做</el-button><el-button size="small" @click="resetEditor">恢复打开时状态</el-button></div>
          <div class="theme-basic"><label>主题名称<el-input v-model="form.name" maxlength="100"/></label><label>主题说明<el-input v-model="form.description" type="textarea" :rows="2" maxlength="500"/></label><label>基础视觉<el-select v-model="form.baseThemeKey"><el-option label="远行手记" value="travel-classic"/><el-option label="三亚海风" value="sanya-breeze"/></el-select></label></div>
          <details open><summary>色彩</summary><div class="theme-color-grid"><label v-for="item in colorFields" :key="item[0]"><span>{{item[1]}}</span><el-color-picker v-model="form.definitionJson.colors[item[0]]"/><code>{{form.definitionJson.colors[item[0]]}}</code></label></div><div class="contrast-note" :class="{warn:!contrast.ok}">正文与背景对比度 {{contrast.ratio}}:1 · {{contrast.ok?'阅读对比度良好':'建议达到 4.5:1 以上'}}</div></details>
          <details><summary>字体与阅读</summary><div class="theme-setting-grid"><label>标题字体<el-select v-model="form.definitionJson.typography.headingFamily"><el-option label="旅行杂志衬线" value="serif"/><el-option label="现代无衬线" value="sans"/></el-select></label><label>正文字体<el-select v-model="form.definitionJson.typography.bodyFamily"><el-option label="清晰无衬线" value="sans"/><el-option label="沉浸衬线" value="serif"/></el-select></label><label>正文字号<el-input-number v-model="form.definitionJson.typography.bodySize" :min="14" :max="22"/></label><label>正文行高<el-input-number v-model="form.definitionJson.typography.lineHeight" :min="1.4" :max="2.2" :step="0.1"/></label></div></details>
          <details><summary>形状与布局</summary><div class="theme-setting-grid"><label>卡片圆角<el-input-number v-model="form.definitionJson.shape.cardRadius" :min="0" :max="32"/></label><label>图片圆角<el-input-number v-model="form.definitionJson.shape.imageRadius" :min="0" :max="32"/></label><label>按钮圆角<el-input-number v-model="form.definitionJson.shape.buttonRadius" :min="0" :max="32"/></label><label>内容宽度<el-input-number v-model="form.definitionJson.layout.contentWidth" :min="960" :max="1600" :step="20"/></label><label>文章宽度<el-input-number v-model="form.definitionJson.layout.articleWidth" :min="600" :max="1000" :step="20"/></label><label>内容密度<el-select v-model="form.definitionJson.layout.density"><el-option label="紧凑" value="compact"/><el-option label="舒适" value="comfortable"/><el-option label="宽松" value="relaxed"/></el-select></label><label>首页布局<el-select v-model="form.definitionJson.layout.homeLayout"><el-option label="旅行杂志" value="editorial"/><el-option label="整齐卡片" value="classic"/></el-select></label></div></details>
          <details><summary>图片与动效</summary><div class="theme-setting-grid"><label>图片风格<el-select v-model="form.definitionJson.image.style"><el-option label="自然" value="natural"/><el-option label="柔和圆角" value="rounded"/><el-option label="相纸" value="paper"/></el-select></label><label>图片阴影<el-select v-model="form.definitionJson.image.shadow"><el-option label="无" value="none"/><el-option label="轻柔" value="soft"/><el-option label="悬浮" value="floating"/></el-select></label><label>卡片图片比例<el-select v-model="form.definitionJson.image.defaultRatio"><el-option label="原始比例" value="natural"/><el-option label="16:9" value="16:9"/><el-option label="4:3" value="4:3"/><el-option label="1:1" value="1:1"/></el-select></label><label>页面动效<el-select v-model="form.definitionJson.motion.level"><el-option label="细微" value="subtle"/><el-option label="关闭" value="none"/></el-select></label></div></details>
        </section><section class="theme-live"><header><strong>网站实时预览</strong><div><button type="button" :class="{active:previewMode==='desktop'}" @click="previewMode='desktop'">桌面</button><button type="button" :class="{active:previewMode==='mobile'}" @click="previewMode='mobile'">手机</button></div></header><div class="theme-frame-wrap" :class="previewMode"><iframe ref="previewFrame" src="/?theme-preview=1" title="主题实时预览" @load="postPreview"></iframe></div></section></div>
        <template #footer><el-button @click="editor=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveTheme">保存主题</el-button></template>
      </el-dialog>
    </div>`
  };

  const routes=[
    {path:'/login',component:Login,meta:{public:true,title:'登录'}},
    {path:'/',component:Dashboard,meta:{title:'管理首页'}},
    {path:'/trips',component:Trips,meta:{title:'旅行管理'}},
    {path:'/trips/:id',component:TripWorkspace,meta:{title:'旅行工作台'}},
    {path:'/journals/:id',component:JournalEditor,meta:{title:'编辑旅行日记',full:true}},
    {path:'/templates',component:TemplateManager,meta:{title:'日记模板'}},
    {path:'/themes',component:Theme,meta:{title:'主题外观'}},
    {path:'/profile',component:Profile,meta:{title:'个人资料'}}
  ];
  const router=VueRouter.createRouter({history:VueRouter.createWebHashHistory(),routes});
  router.beforeEach(async to=>{if(to.meta.public)return true;const user=await loadSession();return user?true:'/login';});

  const App = {
    setup() {
      const drawer=ref(false); const route=VueRouter.useRoute();
      const full=computed(()=>route.meta.full);
      watch(()=>route.fullPath,()=>drawer.value=false);
      async function logout(){try{await api.auth.logout();session.user=null;session.checked=true;router.replace('/login');}catch(e){fail(e);}}
      return{session,drawer,route,full,logout};
    },
    template: `<router-view v-if="route.meta.public"></router-view><div v-else class="admin-shell">
      <div class="sidebar-backdrop" :class="{open:drawer}" @click="drawer=false"></div>
      <aside class="admin-sidebar" :class="{open:drawer}"><button class="sidebar-close" type="button" aria-label="收起侧边栏" @click="drawer=false">×</button><div class="sidebar-brand">远行手记<small>TRAVEL JOURNAL</small></div><nav class="side-nav"><router-link to="/" @click="drawer=false">⌂ 管理首页</router-link><router-link to="/trips" @click="drawer=false">▣ 旅行管理</router-link><router-link to="/templates" @click="drawer=false">▤ 日记模板</router-link><router-link to="/themes" @click="drawer=false">◈ 主题外观</router-link><router-link to="/profile" @click="drawer=false">◎ 个人资料</router-link><a href="/" target="_blank" @click="drawer=false">↗ 查看网站</a></nav><div class="sidebar-user"><div class="sidebar-avatar"><img v-if="session.user?.avatarUrl" :src="session.user.avatarUrl" alt="头像"><span v-else>{{session.user?.displayName?.slice(0,1) || '旅'}}</span></div><div><div>{{session.user?.displayName}}</div><small>{{session.user?.username}}</small></div></div></aside>
      <main class="admin-main"><template v-if="!full"><header class="admin-topbar"><el-button class="mobile-toggle" @click="drawer=!drawer">☰</el-button><h1>{{route.meta.title}}</h1><div class="top-actions"><el-button link @click="logout">退出登录</el-button></div></header><div class="admin-content"><router-view></router-view></div></template><router-view v-else></router-view></main>
    </div>`
  };

  createApp(App)
    .use(router)
    .use(ElementPlus, { locale: window.ElementPlusLocaleZhCn })
    .mount('#admin-app');
})();
