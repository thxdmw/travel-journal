/* 登录、管理首页、旅行列表与旅行工作台。 */
(function () {
  const { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } = Vue;
  const { api, A, JM, applyTheme, message, fail, confirm, session, loadSession,
    tripStatusOptions, itineraryTypeOptions, journalStatusLabels, statusLabel, itineraryTypeLabel,
    shortTime, timeRange, IMAGE_TYPES, TAB_ORDER, renderTemplateSample,
    required, check, slugRule, validateForm, fillForm } = window.AdminShared;
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
      const formRef = ref(null), saving = ref(false);
      // 新建旅行时还没有 trip id，封面文件先暂存在这里，等旅行保存出 id 之后再上传
      const coverInput = ref(null), coverFile = ref(null), coverPreview = ref(''), coverCleared = ref(false);
      const form = reactive(blankTrip());
      function blankTrip() { return { title:'',slug:'',summary:'',status:'PLANNING',startDate:'',endDate:'',defaultCurrency:'CNY',coverMediaId:null,internalNote:'',themeKey:null }; }
      const rules = {
        title:[required('请填写旅行标题')],
        slug:[required('请填写 Slug'), slugRule],
        status:[required('请选择旅行状态','change')],
        startDate:[required('请选择开始日期','change')],
        endDate:[required('请选择结束日期','change'),
          check(value => !value || !form.startDate || value >= form.startDate, '结束日期不能早于开始日期', 'change')],
        defaultCurrency:[required('请填写币种'),
          { pattern:/^[A-Za-z]{3}$/, message:'币种为 3 位字母，例如 CNY', trigger:'blur' }]
      };
      // 优先显示本次选中但还没上传的图片，其次显示已保存的封面
      const coverUrl = computed(() => coverPreview.value
        || (form.coverMediaId ? '/api/media/' + form.coverMediaId + '/thumbnail' : ''));

      async function load() { loading.value=true; try { const result=await Promise.all([A.trips({page:1,pageSize:100,keyword:keyword.value}),A.themes(true)]);data.value=result[0].items;themes.value=result[1]; } catch(e){fail(e);} finally{loading.value=false;} }
      function releasePreview() { if (coverPreview.value) { URL.revokeObjectURL(coverPreview.value); coverPreview.value=''; } }
      function resetCover() { releasePreview(); coverFile.value=null; coverCleared.value=false; }
      function chooseCover() { coverInput.value?.click(); }
      function coverPicked(event) {
        const file = event.target.files?.[0]; event.target.value='';
        if (!file) return;
        if (!IMAGE_TYPES.includes(file.type)) return ElementPlus.ElMessage.warning('封面只支持 JPEG、PNG 和 WebP');
        releasePreview();
        coverFile.value=file; coverCleared.value=false; coverPreview.value=URL.createObjectURL(file);
      }
      function removeCover() {
        releasePreview();
        coverFile.value=null;
        coverCleared.value=!!form.coverMediaId;
        form.coverMediaId=null;
      }
      function open(item) {
        editing.value=item?.id||null;
        fillForm(form, blankTrip, item);
        resetCover();
        dialog.value=true;
        nextTick(() => formRef.value?.clearValidate());
      }
      async function save() {
        if (!await validateForm(formRef)) return;
        saving.value=true;
        try {
          let tripId = editing.value;
          // 移除封面要赶在更新之前：更新会把 coverMediaId 写成 null，
          // 之后服务端就找不到那张旧图，MinIO 里会留下删不掉的孤儿文件
          if (tripId && coverCleared.value && !coverFile.value) await A.clearTripCover(tripId);
          if (tripId) await A.updateTrip(tripId, form);
          else tripId = (await A.createTrip(form)).id;
          // 封面要有 trip id 才能上传，所以放在旅行保存之后；对用户来说仍然只是点一次「保存」
          if (coverFile.value) {
            const payload = new FormData(); payload.append('file', coverFile.value);
            await A.uploadTripCover(tripId, payload);
          }
          dialog.value=false;
          message('旅行已保存');
          load();
        } catch(e){ fail(e); }
        finally { saving.value=false; }
      }
      onMounted(load);
      onBeforeUnmount(releasePreview);
      return { data,themes,loading,dialog,editing,keyword,form,formRef,rules,saving,coverInput,coverUrl,coverFile,
               load,open,save,chooseCover,coverPicked,removeCover,resetCover,tripStatusOptions,statusLabel };
    },
    template: `<div><div class="page-head"><div><h2>旅行管理</h2><p>从计划到完成，集中整理每一次出发。</p></div><el-button type="primary" @click="open()">新建旅行</el-button></div>
      <div class="panel"><div class="toolbar"><el-input v-model="keyword" clearable placeholder="搜索旅行" style="max-width:280px" @keyup.enter="load"/><el-button @click="load">查询</el-button></div>
      <div class="panel-pad"><div v-loading="loading" class="trip-list"><article v-for="item in data" :key="item.id" class="admin-trip-card" @click="$router.push('/trips/'+item.id)">
        <img v-if="item.coverMediaId" class="trip-card-cover" :src="'/api/media/'+item.coverMediaId+'/thumbnail'" :alt="item.title">
        <div v-else class="trip-card-cover trip-card-cover-empty" aria-hidden="true"><span>还没有封面</span></div>
        <span class="status">{{statusLabel(item.status)}}</span><h3>{{item.title}}</h3><p>{{item.summary||'还没有旅行简介'}}</p><footer><span>{{item.startDate}} — {{item.endDate}}</span><el-button link @click.stop="open(item)">编辑</el-button></footer>
      </article></div><el-empty v-if="!data.length&&!loading" description="还没有旅行"/></div></div>
      <el-dialog v-model="dialog" :title="editing?'编辑旅行':'新建旅行'" width="min(680px,92vw)" @closed="resetCover">
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
          <el-form-item label="标题" prop="title"><el-input v-model="form.title" placeholder="例如：京都的四月"/></el-form-item>
          <el-form-item label="Slug" prop="slug"><el-input v-model="form.slug" placeholder="japan-2026，前台网址会用到"/></el-form-item>
          <el-form-item label="封面图片">
            <div class="cover-picker">
              <div class="cover-preview" :class="{empty:!coverUrl}" @click="chooseCover">
                <img v-if="coverUrl" :src="coverUrl" alt="旅行封面"><span v-else>点击选择封面</span>
              </div>
              <div class="cover-actions">
                <el-button size="small" @click="chooseCover">{{coverUrl?'更换封面':'选择封面'}}</el-button>
                <el-button v-if="coverUrl" size="small" type="danger" link @click="removeCover">移除</el-button>
                <small>JPEG / PNG / WebP，保存旅行时一并上传</small>
              </div>
              <input ref="coverInput" hidden type="file" accept="image/jpeg,image/png,image/webp" @change="coverPicked">
            </div>
          </el-form-item>
          <el-form-item label="简介"><el-input v-model="form.summary" type="textarea" :rows="3" maxlength="1000" show-word-limit/></el-form-item>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="开始日期" prop="startDate"><el-date-picker :editable="$allowTextInput" v-model="form.startDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择开始日期"/></el-form-item><el-form-item label="结束日期" prop="endDate"><el-date-picker :editable="$allowTextInput" v-model="form.endDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择结束日期"/></el-form-item></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="状态" prop="status"><el-select v-model="form.status"><el-option v-for="x in tripStatusOptions" :key="x.value" :label="x.label" :value="x.value"/></el-select></el-form-item><el-form-item label="币种" prop="defaultCurrency"><el-input v-model="form.defaultCurrency" maxlength="3" placeholder="CNY"/></el-form-item></div>
          <el-form-item label="旅行专属主题"><el-select v-model="form.themeKey" clearable placeholder="继承全站主题"><el-option v-for="x in themes" :key="x.themeKey" :label="x.name" :value="x.themeKey"/></el-select></el-form-item>
          <el-form-item label="内部备注"><el-input v-model="form.internalNote" type="textarea" :rows="2" placeholder="只有后台能看到"/></el-form-item>
        </el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
      </el-dialog></div>`
  };

  const TripWorkspace = {
    setup() {
      const route = VueRouter.useRoute(); const router = VueRouter.useRouter(); const id = Number(route.params.id);
      /*
       * 当前 tab 同步到 URL。之前它只是个本地 ref，从日记 tab 点进编辑器再返回，
       * 工作台重新挂载就回到概览了；刷新页面也一样会丢。放进 query 之后，
       * 返回和刷新都能停在原来那一栏。
       */
      const active = ref(TAB_ORDER.includes(route.query.tab) ? route.query.tab : 'overview');
      watch(active, value => {
        if (route.query.tab !== value) router.replace({ query: { ...route.query, tab: value } });
      });

      // ------------------------------------------------------------------ 数据块
      // 工作台的数据按用途拆成独立数据块，每块单独记录「是否需要重新拉取」。
      // 某个 tab 保存后只把真正受影响的块标记为过期，其余块保留现有数据不动；
      // 过期的块等切到对应 tab 时才真正重新请求。
      // 这样既不会拿旧数据去新增/编辑，也不会一处改动就把其它 tab 全清空。
      const data = reactive({ trip:null, dashboard:null, stops:[], itinerary:[], budget:null, expenses:[], journals:[] });
      const loaders = {
        trip: () => A.trip(id),
        dashboard: () => A.dashboard(id),
        stops: () => A.stops(id),
        itinerary: () => A.itinerary(id),
        budget: () => A.budget(id),
        expenses: () => A.expenses(id),
        journals: () => A.journals({ page:1, pageSize:100, tripId:id }).then(result => result.items)
      };
      // 每个 tab 渲染时需要哪些数据块；弹窗里的下拉选项也算依赖，
      // 例如「支出」要用预算分类和城市列表填下拉框。
      const tabBlocks = {
        overview: ['trip','dashboard'],
        stops: ['stops'],
        itinerary: ['itinerary','stops'],
        budget: ['budget'],
        expenses: ['expenses','budget','stops'],
        journals: ['journals'],
        settings: ['trip']
      };
      // 某个块改动后，还有哪些块的内容会跟着变。
      // 例如改了城市，行程和支出里的城市下拉、以及概览的统计都会受影响。
      const cascade = {
        trip: ['dashboard'],
        stops: ['dashboard','itinerary','expenses','journals'],
        itinerary: ['dashboard'],
        budget: ['dashboard','expenses'],
        expenses: ['dashboard','budget'],
        journals: ['dashboard']
      };
      const stale = reactive(Object.fromEntries(Object.keys(loaders).map(name => [name, true])));
      // 各数据块自己的加载态。做成按块而不是全局，是为了让「支出」在后台加载时
      // 不会把已经加载好的「概览」也蒙上一层转圈。
      const loadingBlocks = reactive(Object.fromEntries(Object.keys(loaders).map(name => [name, false])));
      const isLoading = (...names) => names.some(name => loadingBlocks[name]);
      const ready = computed(() => !!data.trip);

      // 拉取指定数据块。每块单独 try/catch：一个接口失败不会连累其它块，
      // 失败的块保持过期状态，下次进入这个 tab 会自动重试。
      async function ensure(names, force = false) {
        const targets = [...new Set(names)].filter(name => force || stale[name]);
        if (!targets.length) return;
        await Promise.all(targets.map(async name => {
          loadingBlocks[name] = true;
          try { data[name] = await loaders[name](); stale[name] = false; }
          catch (error) { stale[name] = true; fail(error); }
          finally { loadingBlocks[name] = false; }
        }));
      }
      // 只打标记不发请求，用于本地已经知道结果、不需要回读的场景
      function markStale(...names) {
        names.forEach(name => { stale[name] = true; (cascade[name] || []).forEach(target => stale[target] = true); });
      }
      // 打标记并立刻把当前 tab 用得到的块补齐，其余等切过去时再拉
      function invalidate(...names) { markStale(...names); return ensure(tabBlocks[active.value] || []); }

      // ------------------------------------------------------------------ 弹窗
      // 三个弹窗各自持有独立的开关和编辑目标。
      // 早先它们共用一个字符串状态，用右上角 × 关闭时状态没有复位，
      // 再点「添加」赋的还是同一个值，于是弹窗再也打不开了。
      const stopDialog = ref(false), itemDialog = ref(false), expenseDialog = ref(false);
      const editingStop = ref(null), editingItem = ref(null), editingExpense = ref(null);
      const stopFormRef = ref(null), itemFormRef = ref(null), expenseFormRef = ref(null);
      const savingStop = ref(false), savingItem = ref(false), savingExpense = ref(false);

      const mapStatus = ref({ searchEnabled:false }), locationKeyword = ref(''), locationResults = ref([]),
            locationLoading = ref(false), stopMapEl = ref(null);
      const tabOrder = TAB_ORDER;
      let tabSwipeStart = null;
      let suppressTabClick = false;
      let pickerMap = null, pickerMarker = null;

      const stopForm = reactive(blankStop()), itemForm = reactive(blankItem()), expenseForm = reactive(blankExpense());
      function blankStop(){return{cityName:'',regionName:'',countryName:'中国',countryCode:'CN',latitude:null,longitude:null,placeId:null,formattedAddress:'',adcode:'',coordinateSystem:'GCJ02',locationSource:'MANUAL',arrivalDate:null,departureDate:null,sortOrder:0,note:''};}
      function blankItem(){return{tripStopId:null,itemDate:'',startTime:null,endTime:null,type:'ATTRACTION',title:'',address:'',note:'',plannedCost:0,completed:false,sortOrder:0,allowOutsideTripDates:false};}
      // 金额默认留空而不是 0，否则表单一打开就显示 0，提交时再报「金额必须大于 0」很别扭
      function blankExpense(){return{budgetCategoryId:null,tripStopId:null,expenseDate:'',amount:null,description:'',merchant:'',note:''};}

      const stopRules = {
        cityName:[required('请填写城市或地点名称')],
        countryName:[required('请填写国家')],
        latitude:[required('请搜索地点或在地图上选点','change')],
        longitude:[required('请搜索地点或在地图上选点','change')],
        departureDate:[check(value => !value || !stopForm.arrivalDate || value >= stopForm.arrivalDate,
          '离开日期不能早于到达日期', 'change')]
      };
      const itemRules = {
        title:[required('请填写行程标题')],
        type:[required('请选择行程类型','change')],
        itemDate:[required('请选择行程日期','change'),
          check(value => !value || !data.trip || itemForm.allowOutsideTripDates
              || (value >= data.trip.startDate && value <= data.trip.endDate),
            '日期不在旅行范围内，如确需保留请勾选下方的例外', 'change')],
        endTime:[check(value => !value || !itemForm.startTime || value >= itemForm.startTime,
          '结束时间不能早于开始时间', 'change')],
        plannedCost:[check(value => value === null || value === '' || Number(value) >= 0, '预计花费不能为负数', 'change')]
      };
      const expenseRules = {
        description:[required('请填写支出说明')],
        expenseDate:[required('请选择支出日期','change')],
        budgetCategoryId:[required('请选择预算分类','change')],
        amount:[required('请填写支出金额','change'), check(value => Number(value) > 0, '支出金额必须大于 0', 'change')]
      };

      // ------------------------------------------------------------------ 城市（含地图选点）
      async function openStop(row){
        editingStop.value = row?.id || null;
        fillForm(stopForm, blankStop, row);
        locationKeyword.value = row?.formattedAddress || row?.cityName || '';
        locationResults.value = [];
        stopDialog.value = true;
        nextTick(() => stopFormRef.value?.clearValidate());
        try { mapStatus.value = await A.mapStatus(); } catch(_) { mapStatus.value = { searchEnabled:false }; }
        await nextTick(); setTimeout(initStopMap, 80);
      }
      function closeStop(){
        editingStop.value = null; locationResults.value = [];
        if (pickerMap) { pickerMap.remove(); pickerMap = null; pickerMarker = null; }
      }
      function initStopMap(){
        if(!window.L||!stopMapEl.value||pickerMap)return;
        const valid=Number.isFinite(Number(stopForm.latitude))&&Number.isFinite(Number(stopForm.longitude))&&!(Number(stopForm.latitude)===0&&Number(stopForm.longitude)===0);
        const center=valid?[Number(stopForm.latitude),Number(stopForm.longitude)]:[35.4,104.2];
        pickerMap=L.map(stopMapEl.value,{scrollWheelZoom:false,zoomControl:true}).setView(center,valid?11:4);
        L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',{subdomains:'1234',maxZoom:18,attribution:'© 高德地图'}).addTo(pickerMap);
        pickerMap.on('click',event=>pickLocation(event.latlng.lat,event.latlng.lng,true));
        // 只有按住 Ctrl 才缩放，避免页面滚动时误触地图
        stopMapEl.value.addEventListener('wheel',event=>{if(!event.ctrlKey)return;event.preventDefault();event.stopPropagation();pickerMap.setZoomAround(pickerMap.mouseEventToContainerPoint(event),pickerMap.getZoom()+(event.deltaY<0?1:-1));},{passive:false});
        if(valid)setPickerMarker(center[0],center[1]);
        requestAnimationFrame(()=>pickerMap.invalidateSize(false));
      }
      function setPickerMarker(latitude,longitude){
        if(!pickerMap)return;
        if(!pickerMarker){pickerMarker=L.marker([latitude,longitude],{draggable:true}).addTo(pickerMap);pickerMarker.on('dragend',event=>{const p=event.target.getLatLng();pickLocation(p.lat,p.lng,true);});}
        else pickerMarker.setLatLng([latitude,longitude]);
      }
      // 把搜索结果或逆地理编码结果填进表单，并同步校验状态（坐标是必填项）
      function applyLocation(item,move=true){
        stopForm.cityName=item.city||item.name||stopForm.cityName;stopForm.regionName=item.province||item.district||'';stopForm.countryName=item.country||'中国';stopForm.countryCode=item.countryCode||'CN';
        stopForm.latitude=Number(item.latitude);stopForm.longitude=Number(item.longitude);stopForm.placeId=item.placeId||null;stopForm.formattedAddress=item.formattedAddress||item.address||'';stopForm.adcode=item.adcode||'';stopForm.coordinateSystem=item.coordinateSystem||'GCJ02';stopForm.locationSource=item.locationSource||'MAP_PICK';
        setPickerMarker(stopForm.latitude,stopForm.longitude);if(move&&pickerMap)pickerMap.setView([stopForm.latitude,stopForm.longitude],Math.max(pickerMap.getZoom(),12));locationResults.value=[];
        stopFormRef.value?.clearValidate(['latitude','longitude']);
      }
      async function pickLocation(latitude,longitude,reverse){
        stopForm.latitude=Number(latitude.toFixed(6));stopForm.longitude=Number(longitude.toFixed(6));stopForm.locationSource='MAP_PICK';stopForm.coordinateSystem='GCJ02';setPickerMarker(stopForm.latitude,stopForm.longitude);
        stopFormRef.value?.clearValidate(['latitude','longitude']);
        if(reverse&&mapStatus.value.searchEnabled){try{const item=await A.reverseLocation(stopForm.latitude,stopForm.longitude);applyLocation(item,false);}catch(e){ElementPlus.ElMessage.warning(e.message||'地址识别失败，可继续手动填写');}}
      }
      async function searchLocations(){
        if(!locationKeyword.value.trim())return ElementPlus.ElMessage.warning('请输入城市、景点或地址');
        if(!mapStatus.value.searchEnabled)return ElementPlus.ElMessage.warning('请先在服务端配置 AMAP_WEB_SERVICE_KEY');
        locationLoading.value=true;try{locationResults.value=await A.searchLocations(locationKeyword.value,stopForm.regionName);if(!locationResults.value.length)ElementPlus.ElMessage.info('没有找到匹配地点');}catch(e){fail(e);}finally{locationLoading.value=false;}
      }
      async function saveStop(){
        if(!await validateForm(stopFormRef))return;
        savingStop.value=true;
        try{
          editingStop.value?await A.updateStop(editingStop.value,stopForm):await A.createStop(id,stopForm);
          stopDialog.value=false;message('城市已保存');
          await invalidate('stops');
        }catch(e){fail(e);}finally{savingStop.value=false;}
      }

      // ------------------------------------------------------------------ 行程
      function openItem(row){
        editingItem.value=row?.id||null;
        fillForm(itemForm,blankItem,row);
        itemDialog.value=true;
        nextTick(()=>itemFormRef.value?.clearValidate());
      }
      async function saveItem(){
        if(!await validateForm(itemFormRef))return;
        savingItem.value=true;
        try{
          editingItem.value?await A.updateItinerary(editingItem.value,itemForm):await A.createItinerary(id,itemForm);
          itemDialog.value=false;message('行程已保存');
          await invalidate('itinerary');
        }catch(e){fail(e);}finally{savingItem.value=false;}
      }
      // 勾选完成状态。失败时把勾选状态还原，否则界面会显示成已保存的样子。
      async function toggleCompleted(row){
        try{
          await A.completeItinerary(row.id,row.completed);
          stale.dashboard=true; // 结果本地已知，只让概览统计过期，不必重拉整个行程列表
        }catch(e){row.completed=!row.completed;fail(e);}
      }

      // ------------------------------------------------------------------ 支出
      function openExpense(row){
        editingExpense.value=row?.id||null;
        fillForm(expenseForm,blankExpense,row);
        expenseDialog.value=true;
        nextTick(()=>expenseFormRef.value?.clearValidate());
      }
      async function saveExpense(){
        if(!await validateForm(expenseFormRef))return;
        savingExpense.value=true;
        try{
          editingExpense.value?await A.updateExpense(editingExpense.value,expenseForm):await A.createExpense(id,expenseForm);
          expenseDialog.value=false;message('支出已保存');
          await invalidate('expenses');
        }catch(e){fail(e);}finally{savingExpense.value=false;}
      }
      // 保存预算分类的计划金额。不传 sortOrder，后端会跳过 null 字段，保留原有排序。
      async function saveCategory(row){
        try{
          await A.updateCategory(row.id,{code:row.code,name:row.name,plannedAmount:row.planned});
          message('预算已更新');
          await invalidate('budget');
        }catch(e){fail(e);}
      }

      // ------------------------------------------------------------------ 删除
      async function remove(kind,row){
        const labels={stop:'城市',item:'行程',expense:'支出'};
        const blocks={stop:'stops',item:'itinerary',expense:'expenses'};
        try{
          await confirm('确定删除这条' + labels[kind] + '记录吗？');
          if(kind==='stop')await A.deleteStop(row.id);
          if(kind==='item')await A.deleteItinerary(row.id);
          if(kind==='expense')await A.deleteExpense(row.id);
          message('已删除');
          await invalidate(blocks[kind]);
        }catch(e){if(e!=='cancel'&&e!=='close')fail(e);}
      }
      // 删除日记会连带删掉它的图片，所以先问一次张数，把后果写清楚再让用户确认
      async function removeJournal(row){
        try{
          let count=0;
          try{ count=(await A.journalMediaCount(row.id))?.count||0; }catch(_){ count=0; }
          const parts=[];
          if(row.status==='PUBLISHED')parts.push('这是一篇已发布的日记，删除后前台会立即无法访问。');
          parts.push(count>0
            ? '日记正文和其中的 ' + count + ' 张图片会一起删除，且无法恢复。'
            : '日记删除后无法恢复。');
          await confirm(parts.join('') + '确定继续吗？');
          const result=await A.deleteJournal(row.id);
          message(result?.removedMedia>0?'已删除日记及 ' + result.removedMedia + ' 张图片':'日记已删除');
          await invalidate('journals');
        }catch(e){if(e!=='cancel'&&e!=='close')fail(e);}
      }

      /*
       * ------------------------------------------------------------------ 移动端 tab 栏
       * 这里只做一件事：横滑 tab 栏时别把它当成点击。
       *
       * 原来还有两个行为，都去掉了：
       *  - 横滑切换 tab：滑动的意图是「看看后面还有哪些 tab」，不是换页；
       *    滑一下内容就整个换掉很意外，点哪个才该是哪个。
       *  - 切 tab 后 scrollIntoView 居中：配合 CSS 的 scroll-snap-align:center，
       *    滑到末尾会被拽回去，手感像橡皮筋。现在滑到哪停哪。
       */
      function beginTabSwipe(event){
        if(!event.target.closest('.el-tabs__header'))return;
        const touch=event.touches[0];tabSwipeStart={x:touch.clientX,y:touch.clientY,moved:false};
      }
      function moveTabSwipe(event){
        if(!tabSwipeStart)return;
        const touch=event.touches[0];
        if(Math.abs(touch.clientX-tabSwipeStart.x)>6)tabSwipeStart.moved=true;
      }
      function endTabSwipe(){
        // 真的滑动过就吃掉紧随其后的 click，否则手指抬起时落在哪个 tab 上就会切到哪个
        if(tabSwipeStart&&tabSwipeStart.moved){
          suppressTabClick=true;
          setTimeout(()=>{suppressTabClick=false;},350);
        }
        tabSwipeStart=null;
      }
      function onTabHeaderClick(event){
        if(!suppressTabClick)return;
        suppressTabClick=false;
        event.preventDefault();event.stopPropagation();
      }
      // 切 tab 时补齐这个 tab 需要、且已经过期的数据块
      watch(active,tab=>ensure(tabBlocks[tab]||[]));
      onMounted(()=>ensure(['trip',...tabBlocks[active.value]]));

      return {data,stale,isLoading,ready,active,
              stopDialog,itemDialog,expenseDialog,editingStop,editingItem,editingExpense,
              stopFormRef,itemFormRef,expenseFormRef,savingStop,savingItem,savingExpense,
              stopForm,itemForm,expenseForm,stopRules,itemRules,expenseRules,
              mapStatus,locationKeyword,locationResults,locationLoading,stopMapEl,
              openStop,closeStop,searchLocations,applyLocation,saveStop,
              openItem,saveItem,toggleCompleted,openExpense,saveExpense,saveCategory,
              remove,removeJournal,beginTabSwipe,moveTabSwipe,endTabSwipe,onTabHeaderClick,router,
              itineraryTypeOptions,statusLabel,itineraryTypeLabel,timeRange};
    },
    template: `<div v-if="ready"><div class="workspace-head"><span class="back" @click="router.push('/trips')">← 返回</span><div><h2>{{data.trip.title}}</h2><div class="workspace-meta">{{data.trip.startDate}} — {{data.trip.endDate}} · {{statusLabel(data.trip.status)}}</div></div></div>
      <el-tabs v-model="active" class="workspace-tabs" @touchstart.passive="beginTabSwipe" @touchmove.passive="moveTabSwipe" @touchend.passive="endTabSwipe" @click.capture="onTabHeaderClick">
        <el-tab-pane label="概览" name="overview"><div v-loading="isLoading('trip','dashboard')" class="tab-loading-host"><div class="dashboard-grid"><div class="metric"><span>城市</span><strong>{{data.dashboard?.stopCount ?? '—'}}</strong></div><div class="metric"><span>行程</span><strong>{{data.dashboard?.itineraryCount ?? '—'}}</strong></div><div class="metric"><span>草稿</span><strong>{{data.dashboard?.draftCount ?? '—'}}</strong></div><div class="metric"><span>已发布</span><strong>{{data.dashboard?.publishedCount ?? '—'}}</strong></div></div><p>{{data.trip.summary||'还没有旅行简介。'}}</p></div></el-tab-pane>
        <el-tab-pane label="城市" name="stops"><div class="tab-actions"><el-button type="primary" @click="openStop()">添加城市</el-button></div><el-table v-loading="isLoading('stops')" :data="data.stops" max-height="calc(100vh - 360px)"><el-table-column prop="cityName" label="城市"/><el-table-column prop="countryName" label="国家"/><el-table-column prop="arrivalDate" label="到达"/><el-table-column prop="departureDate" label="离开"/><el-table-column label="操作" width="140"><template #default="{row}"><div class="table-actions"><el-button size="small" @click="openStop(row)">编辑</el-button><el-button size="small" type="danger" plain @click="remove('stop',row)">删除</el-button></div></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="行程" name="itinerary"><div class="tab-actions"><el-button type="primary" @click="openItem()">添加行程</el-button></div><el-table v-loading="isLoading('itinerary')" :data="data.itinerary" max-height="calc(100vh - 360px)"><el-table-column prop="itemDate" label="日期" width="120"/><el-table-column label="时间" width="140"><template #default="{row}">{{timeRange(row.startTime,row.endTime)}}</template></el-table-column><el-table-column label="类型" width="110"><template #default="{row}">{{itineraryTypeLabel(row.type)}}</template></el-table-column><el-table-column prop="title" label="行程"/><el-table-column label="完成" width="80"><template #default="{row}"><el-checkbox v-model="row.completed" @change="toggleCompleted(row)"/></template></el-table-column><el-table-column label="操作" width="140"><template #default="{row}"><div class="table-actions"><el-button size="small" @click="openItem(row)">编辑</el-button><el-button size="small" type="danger" plain @click="remove('item',row)">删除</el-button></div></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="预算" name="budget"><div v-loading="isLoading('budget')" class="tab-loading-host"><div class="budget-summary"><div class="item"><span>总预算</span><strong>{{data.budget?.currency}} {{data.budget?.plannedTotal ?? '—'}}</strong></div><div class="item"><span>已支出</span><strong>{{data.budget?.currency}} {{data.budget?.actualTotal ?? '—'}}</strong></div><div class="item"><span>剩余</span><strong :class="{over:data.budget?.remaining<0}">{{data.budget?.currency}} {{data.budget?.remaining ?? '—'}}</strong></div></div><el-table :data="data.budget?.categories||[]" max-height="calc(100vh - 430px)"><el-table-column prop="name" label="分类"/><el-table-column label="计划金额" min-width="180"><template #default="{row}"><el-input-number class="budget-amount-input" v-model="row.planned" :min="0" :precision="2"/></template></el-table-column><el-table-column prop="actual" label="实际支出"/><el-table-column prop="remaining" label="剩余"/><el-table-column width="90"><template #default="{row}"><el-button link @click="saveCategory(row)">保存</el-button></template></el-table-column></el-table></div></el-tab-pane>
        <el-tab-pane label="支出" name="expenses"><div class="tab-actions"><el-button type="primary" @click="openExpense()">记录支出</el-button></div><el-table v-loading="isLoading('expenses')" :data="data.expenses" max-height="calc(100vh - 360px)"><el-table-column prop="expenseDate" label="日期"/><el-table-column prop="description" label="说明"/><el-table-column prop="merchant" label="商户"/><el-table-column prop="amount" label="金额"/><el-table-column label="操作" width="140"><template #default="{row}"><div class="table-actions"><el-button size="small" @click="openExpense(row)">编辑</el-button><el-button size="small" type="danger" plain @click="remove('expense',row)">删除</el-button></div></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="日记" name="journals"><div class="tab-actions"><el-button type="primary" @click="router.push('/journals/new?tripId='+data.trip.id+'&from=journals')">新建日记</el-button></div><el-table v-loading="isLoading('journals')" :data="data.journals" max-height="calc(100vh - 360px)"><el-table-column prop="title" label="标题"/><el-table-column prop="occurredOn" label="日期"/><el-table-column label="状态"><template #default="{row}">{{statusLabel(row.status)}}</template></el-table-column><el-table-column label="操作" width="150"><template #default="{row}"><div class="table-actions"><el-button size="small" @click="router.push('/journals/'+row.id+'?from=journals')">编辑</el-button><el-button size="small" type="danger" plain @click="removeJournal(row)">删除</el-button></div></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="设置" name="settings"><el-descriptions border :column="1"><el-descriptions-item label="Slug">{{data.trip.slug}}</el-descriptions-item><el-descriptions-item label="默认币种">{{data.trip.defaultCurrency}}</el-descriptions-item><el-descriptions-item label="封面"><img v-if="data.trip.coverMediaId" class="settings-cover" :src="'/api/media/'+data.trip.coverMediaId+'/thumbnail'" alt="旅行封面"><span v-else>还没有设置封面，可在旅行管理里编辑</span></el-descriptions-item><el-descriptions-item label="内部备注">{{data.trip.internalNote||'无'}}</el-descriptions-item></el-descriptions><el-button style="margin-top:18px" @click="router.push('/themes')">查看主题外观</el-button></el-tab-pane>
      </el-tabs>

      <el-dialog v-model="stopDialog" class="location-dialog" :title="editingStop?'编辑地点':'添加地点'" width="min(780px,96vw)" destroy-on-close @closed="closeStop">
        <div class="location-search"><el-input v-model="locationKeyword" clearable placeholder="搜索城市、景点、酒店或详细地址" @keyup.enter="searchLocations"><template #prepend>地点</template></el-input><el-button type="primary" :loading="locationLoading" @click="searchLocations">搜索</el-button></div>
        <div v-if="!mapStatus.searchEnabled" class="map-config-hint">尚未配置地点搜索；仍可直接点击地图选点或在高级设置中填写坐标。</div>
        <div v-if="locationResults.length" class="location-results"><button v-for="item in locationResults" :key="item.placeId" type="button" @click="applyLocation(item)"><strong>{{item.name}}</strong><span>{{[item.formattedAddress,item.city,item.district].filter(Boolean).join(' · ')}}</span></button></div>
        <div ref="stopMapEl" class="stop-picker-map"><span class="map-picker-tip map-picker-tip-desktop">点击地图选点 · 拖动标记微调 · Ctrl + 滚轮缩放</span><span class="map-picker-tip map-picker-tip-mobile">点击地图选点 · 拖动标记微调</span></div>
        <el-form ref="stopFormRef" :model="stopForm" :rules="stopRules" label-position="top" class="location-form">
          <div class="form-grid form-grid-2"><el-form-item label="城市 / 地点名称" prop="cityName"><el-input v-model="stopForm.cityName"/></el-form-item><el-form-item label="省份 / 区域"><el-input v-model="stopForm.regionName"/></el-form-item></div>
          <el-form-item label="格式化地址"><el-input v-model="stopForm.formattedAddress" placeholder="选择搜索结果后自动填写"/></el-form-item>
          <el-form-item prop="latitude" class="coordinate-status"><template #label>地点坐标 <small>必填，搜索结果或地图选点会自动填入</small></template><span v-if="stopForm.latitude!==null&&stopForm.longitude!==null" class="coordinate-value">{{stopForm.latitude}}, {{stopForm.longitude}}</span><span v-else class="coordinate-empty">尚未选点</span></el-form-item>
          <div class="form-grid form-grid-2"><el-form-item label="到达日期"><el-date-picker :editable="$allowTextInput" v-model="stopForm.arrivalDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择到达日期"/></el-form-item><el-form-item label="离开日期" prop="departureDate"><el-date-picker :editable="$allowTextInput" v-model="stopForm.departureDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择离开日期"/></el-form-item></div>
          <details class="advanced-location"><summary>高级地点信息</summary><div class="form-grid form-grid-2"><el-form-item label="国家" prop="countryName"><el-input v-model="stopForm.countryName"/></el-form-item><el-form-item label="国家代码"><el-input v-model="stopForm.countryCode" maxlength="2"/></el-form-item></div><div class="form-grid form-grid-2"><el-form-item label="纬度"><el-input-number v-model="stopForm.latitude" :precision="6" :controls="false"/></el-form-item><el-form-item label="经度"><el-input-number v-model="stopForm.longitude" :precision="6" :controls="false"/></el-form-item></div><div class="form-grid form-grid-2"><el-form-item label="行政区代码"><el-input v-model="stopForm.adcode"/></el-form-item><el-form-item label="坐标系"><el-select v-model="stopForm.coordinateSystem"><el-option label="高德 GCJ-02" value="GCJ02"/><el-option label="WGS84" value="WGS84"/></el-select></el-form-item></div></details>
          <el-form-item label="备注"><el-input v-model="stopForm.note" type="textarea" :rows="2"/></el-form-item>
        </el-form>
        <template #footer><el-button @click="stopDialog=false">取消</el-button><el-button type="primary" :loading="savingStop" @click="saveStop">保存地点</el-button></template>
      </el-dialog>
      <el-dialog v-model="itemDialog" :title="editingItem?'编辑行程':'添加行程'" width="min(650px,92vw)" destroy-on-close @closed="editingItem=null">
        <el-form ref="itemFormRef" :model="itemForm" :rules="itemRules" label-position="top">
          <el-form-item label="标题" prop="title"><el-input v-model="itemForm.title" placeholder="例如：清水寺"/></el-form-item>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="日期" prop="itemDate"><el-date-picker :editable="$allowTextInput" v-model="itemForm.itemDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择日期"/></el-form-item><el-form-item label="类型" prop="type"><el-select v-model="itemForm.type"><el-option v-for="x in itineraryTypeOptions" :key="x.value" :label="x.label" :value="x.value"/></el-select></el-form-item></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="开始"><el-time-picker :editable="$allowTextInput" v-model="itemForm.startTime" format="HH时mm分" value-format="HH:mm:ss" placeholder="开始时间"/></el-form-item><el-form-item label="结束" prop="endTime"><el-time-picker :editable="$allowTextInput" v-model="itemForm.endTime" format="HH时mm分" value-format="HH:mm:ss" placeholder="结束时间"/></el-form-item></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="所属城市"><el-select v-model="itemForm.tripStopId" clearable placeholder="不指定"><el-option v-for="x in data.stops" :key="x.id" :label="x.cityName" :value="x.id"/></el-select></el-form-item><el-form-item prop="plannedCost"><template #label>预计花费<small class="form-hint">这一项打算花多少钱，{{data.trip?.defaultCurrency||'CNY'}}</small></template><el-input-number v-model="itemForm.plannedCost" :min="0" :precision="2" controls-position="right"/></el-form-item></div>
          <el-form-item label="地址"><el-input v-model="itemForm.address"/></el-form-item>
          <el-form-item label="备注"><el-input v-model="itemForm.note" type="textarea"/></el-form-item>
          <el-form-item><el-checkbox v-model="itemForm.allowOutsideTripDates">允许日期超出旅行的起止范围</el-checkbox></el-form-item>
        </el-form>
        <template #footer><el-button @click="itemDialog=false">取消</el-button><el-button type="primary" :loading="savingItem" @click="saveItem">保存</el-button></template>
      </el-dialog>

      <el-dialog v-model="expenseDialog" :title="editingExpense?'编辑支出':'记录支出'" width="min(600px,92vw)" destroy-on-close @closed="editingExpense=null">
        <el-form ref="expenseFormRef" :model="expenseForm" :rules="expenseRules" label-position="top">
          <el-form-item label="说明" prop="description"><el-input v-model="expenseForm.description" placeholder="例如：新干线车票"/></el-form-item>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="日期" prop="expenseDate"><el-date-picker :editable="$allowTextInput" v-model="expenseForm.expenseDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择日期"/></el-form-item><el-form-item label="金额" prop="amount"><el-input-number v-model="expenseForm.amount" :min="0.01" :precision="2"/></el-form-item></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="分类" prop="budgetCategoryId"><el-select v-model="expenseForm.budgetCategoryId" placeholder="选择预算分类"><el-option v-for="x in (data.budget?data.budget.categories:[])" :key="x.id" :label="x.name" :value="x.id"/></el-select></el-form-item><el-form-item label="所属城市"><el-select v-model="expenseForm.tripStopId" clearable placeholder="不指定"><el-option v-for="x in data.stops" :key="x.id" :label="x.cityName" :value="x.id"/></el-select></el-form-item></div>
          <el-form-item label="商户"><el-input v-model="expenseForm.merchant"/></el-form-item>
          <el-form-item label="备注"><el-input v-model="expenseForm.note" type="textarea"/></el-form-item>
        </el-form>
        <template #footer><el-button @click="expenseDialog=false">取消</el-button><el-button type="primary" :loading="savingExpense" @click="saveExpense">保存</el-button></template>
      </el-dialog>
    </div><div v-else style="padding:80px;text-align:center">正在打开旅行工作台…</div>`
  };
  Object.assign(window.AdminPages, { Login, Dashboard, Trips, TripWorkspace });
})();
