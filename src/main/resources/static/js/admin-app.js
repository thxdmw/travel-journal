(function () {
  const { createApp, ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } = Vue;
  const api = window.TravelApi;
  const A = api.admin;
  // 正文图片标记的拼装、反解和轮播/对比的行为，和公开端共用一份
  const JM = window.JournalMedia;
  function syncVisualViewport(){
    const viewport=window.visualViewport;
    const bottom=viewport?Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop):0;
    document.documentElement.style.setProperty('--visual-viewport-height',(viewport?.height||window.innerHeight)+'px');
    document.documentElement.style.setProperty('--browser-bottom-inset',bottom+'px');
  }
  syncVisualViewport();
  window.visualViewport?.addEventListener('resize',syncVisualViewport);
  window.visualViewport?.addEventListener('scroll',syncVisualViewport);
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
  /** 后端存的是 HH:mm:ss，列表里只看时和分；没填结束时间就只显示开始。 */
  const shortTime = value => (value ? String(value).slice(0, 5) : '');
  const timeRange = (start, end) => {
    const from = shortTime(start), to = shortTime(end);
    if (from && to) return from + ' – ' + to;
    return from || to || '—';
  };
  const IMAGE_TYPES = ['image/jpeg','image/png','image/webp'];
  /** 旅行工作台的 tab 顺序，同时用于校验 URL 上带回来的 tab 参数。 */
  const TAB_ORDER = ['overview','stops','itinerary','budget','expenses','journals','settings'];

  // 模板管理器与正文编辑器共用同一份 Block 示例渲染。
  const renderTemplateSample = blocks => window.JournalBlocks.sampleDocument(blocks);

  // 生成一条必填规则。下拉框和日期选择器要用 change 触发，输入框用 blur。
  const required = (message, trigger='blur') => ({ required:true, message, trigger });
  // 把任意校验函数包成 Element Plus 认识的 validator 规则，返回 true 表示通过
  const check = (fn, message, trigger='blur') => ({
    validator: (rule, value, callback) => fn(value) ? callback() : callback(new Error(message)), trigger
  });
  const slugRule = { pattern:/^[a-z0-9]+(?:-[a-z0-9]+)*$/, message:'只能使用小写字母、数字和短横线', trigger:'blur' };

  // 提交前统一走一次表单校验，未通过时给一句总的提示，具体错误由各字段自己显示
  /** @param quiet 校验失败时不弹提示（自动保存用，静默跳过即可） */
  async function validateForm(formRef, quiet = false) {
    if (!formRef.value) return true;
    try { await formRef.value.validate(); return true; }
    catch (_) {
      if (!quiet) ElementPlus.ElMessage.warning('请先补全标记为必填的内容');
      return false;
    }
  }

  // 用空白模板重置表单，再按模板声明的字段回填。
  // 直接 Object.assign 会把上一条记录的 id、tripId、createdAt 留在表单里，
  // 编辑完一条再点「新增」时这些残留字段会跟着提交出去。
  function fillForm(form, blank, row) {
    const template = blank();
    Object.keys(form).forEach(key => { if (!(key in template)) delete form[key]; });
    Object.assign(form, template);
    if (row) Object.keys(template).forEach(key => { if (row[key] !== undefined) form[key] = row[key]; });
  }

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
  const JournalEditor = {
    components:{ JournalBlockEditor:window.JournalBlockEditor },
    setup() {
      const route=VueRouter.useRoute(),router=VueRouter.useRouter();
      const id=ref(route.params.id==='new'?null:Number(route.params.id));
      const trips=ref([]),stops=ref([]),media=ref([]),templates=ref([]),themes=ref([]);
      const pageLoading=ref(true),saving=ref(false),uploading=ref(false),dirty=ref(false);
      const formRef=ref(null),fileInput=ref(null),blockEditor=ref(null);
      const selectedMedia=ref([]),dragFrom=ref(null),dragOver=ref(null);
      const mobilePane=ref('write');
      const metaCollapsed=ref(localStorage.getItem('travel-journal.editor-meta-collapsed')==='on');
      const templateDialog=ref(false),selectedTemplate=ref(null),templateData=ref({}),generating=ref(false);
      const previewLink=ref(''),autoSaveState=ref(''),tagInput=ref('');
      const form=reactive({tripId:route.query.tripId?Number(route.query.tripId):null,tripStopId:null,
        title:'',slug:'',excerpt:'',contentJson:window.JournalBlocks.emptyDocument(),occurredOn:'',
        coverMediaId:null,status:'DRAFT',themeKey:null,templateId:null,templateVersion:null,tags:[]});
      const rules={title:[required('请填写日记标题')],tripId:[required('请选择所属旅行','change')],
        slug:[required('请填写 Slug'),slugRule],occurredOn:[required('请选择发生日期','change')]};
      const wordCount=computed(()=>window.JournalBlocks.wordCount(form.contentJson));
      const allSelected=computed(()=>media.value.length>0&&selectedMedia.value.length===media.value.length);
      const templateBlocks=computed(()=>selectedTemplate.value?.definitionJson?.blocks||[]);
      const draftKey=computed(()=>id.value?'travel-journal.blocks-draft.'+id.value:'travel-journal.blocks-draft.new');

      function body(){return{tripId:form.tripId,tripStopId:form.tripStopId,title:form.title,slug:form.slug,
        excerpt:form.excerpt,contentJson:form.contentJson,occurredOn:form.occurredOn,coverMediaId:form.coverMediaId,
        themeKey:form.themeKey,templateId:form.templateId,templateVersion:form.templateVersion,tags:form.tags||[]};}
      async function load(){
        pageLoading.value=true;
        try{
          const result=await Promise.all([(await A.trips({page:1,pageSize:100})).items,A.templates(true),A.themes(true)]);
          trips.value=result[0];templates.value=result[1];themes.value=result[2];
          if(id.value){const entry=await A.journal(id.value);Object.assign(form,entry);
            form.contentJson=window.JournalBlocks.normalize(entry.contentJson);media.value=await A.media(id.value);}
          if(form.tripId)stops.value=await A.stops(form.tripId);
          selectedTemplate.value=templates.value.find(x=>x.id===form.templateId)||null;if(selectedTemplate.value)selectTemplate(selectedTemplate.value);
          const local=localStorage.getItem(draftKey.value);
          if(local){try{
            const saved=JSON.parse(local);
            if(saved.savedAt&&saved.form){
              try{await confirm('发现本机保存的编辑快照，是否恢复？');Object.assign(form,saved.form);}catch(_){}
            }
          }catch(_){}}
          dirty.value=false;
        }catch(e){fail(e);}finally{pageLoading.value=false;}
      }
      watch(()=>form.tripId,async value=>{stops.value=value?await A.stops(value):[];if(!stops.value.some(x=>x.id===form.tripStopId))form.tripStopId=null;});
      watch(()=>form.occurredOn,value=>{if(value&&!form.slug)form.slug='journal-'+value.replaceAll('-','')+'-'+Date.now().toString().slice(-5);});
      watch(metaCollapsed,value=>localStorage.setItem('travel-journal.editor-meta-collapsed',value?'on':'off'));
      watch(form,()=>{
        if(pageLoading.value)return;dirty.value=true;
        if(form.status==='PUBLISHED')autoSaveState.value='修改已暂存于本机';
        localStorage.setItem(draftKey.value,JSON.stringify({savedAt:Date.now(),form:body()}));
      },{deep:true});
      async function save(silent=false,quiet=false){
        if(form.status==='PUBLISHED'){
          if(!silent)ElementPlus.ElMessage.info('已发布日记请使用“更新发布”，公开内容才会改变');
          return false;
        }
        if(!await validateForm(formRef,quiet)){metaCollapsed.value=false;return false;}
        saving.value=true;
        try{
          if(id.value)await A.updateJournal(id.value,body());
          else{const created=await A.createJournal(body());id.value=created.id;form.status=created.status;
            router.replace({path:'/journals/'+created.id,query:route.query.from?{from:route.query.from}:{}});}
          dirty.value=false;autoSaveState.value='已保存';localStorage.removeItem(draftKey.value);localStorage.removeItem('travel-journal.blocks-draft.new');
          if(!silent)message('草稿已保存');return true;
        }catch(e){if(!quiet)fail(e);autoSaveState.value='保存失败';return false;}finally{saving.value=false;}
      }
      async function publish(){if(!await save(true))return;try{await A.publishJournal(id.value);form.status='PUBLISHED';await nextTick();dirty.value=false;autoSaveState.value='已发布';localStorage.removeItem(draftKey.value);message('日记已发布');}catch(e){fail(e);}}
      async function updatePublished(){
        if(!await validateForm(formRef)){metaCollapsed.value=false;return;}
        saving.value=true;
        try{await A.updateJournal(id.value,body());await nextTick();dirty.value=false;
          autoSaveState.value='已更新发布';localStorage.removeItem(draftKey.value);message('公开文章已更新');
        }catch(e){fail(e);autoSaveState.value='更新失败';}finally{saving.value=false;}
      }
      async function unpublish(){try{await A.unpublishJournal(id.value);form.status='DRAFT';await nextTick();dirty.value=false;autoSaveState.value='已撤回为草稿';localStorage.removeItem(draftKey.value);message('日记已撤回');}catch(e){fail(e);}}
      async function requireDraft(){if(id.value)return true;try{await confirm('上传图片前需要先保存一次草稿，现在保存吗？');return await save(true);}catch(_){return false;}}
      async function upload(files){
        const list=Array.from(files||[]).filter(x=>x.type&&x.type.startsWith('image/'));if(!list.length||!await requireDraft())return;
        uploading.value=true;const added=[];
        try{for(const file of list){const data=new FormData();data.append('file',file);const item=await A.uploadMedia(id.value,data);media.value.push(item);added.push(item);}}
        catch(e){fail(e);}finally{uploading.value=false;}
        if(added.length){mobilePane.value='write';blockEditor.value?.insertMedia(added.map(x=>x.id));message('图片已上传，请确认插入方式');}
      }
      function picked(event){upload(event.target.files);event.target.value='';}
      function dropped(event){upload(event.dataTransfer?.files);}
      function pasted(event){const files=Array.from(event.clipboardData?.files||[]).filter(x=>x.type?.startsWith('image/'));if(files.length){event.preventDefault();upload(files);}}
      async function setCover(item){
        if(form.status==='PUBLISHED'){form.coverMediaId=item.id;message('已选择封面，点击“更新发布”后生效');return;}
        try{await A.setCover(id.value,item.id);form.coverMediaId=item.id;message('封面已更新');}catch(e){fail(e);}
      }
      async function saveCaption(item){try{await A.updateMediaCaption(item.relationId,item.caption||'');message('图注已保存');}catch(e){fail(e);}}
      async function removeMedia(item){try{await confirm('确定删除这张图片吗？正文仍在使用时系统会拒绝删除。');await A.deleteMedia(item.relationId);media.value=media.value.filter(x=>x.relationId!==item.relationId);if(form.coverMediaId===item.id)form.coverMediaId=null;}catch(e){if(e!=='cancel'&&e!=='close')fail(e);}}
      function toggleSelect(item){selectedMedia.value=selectedMedia.value.includes(item.id)?selectedMedia.value.filter(x=>x!==item.id):[...selectedMedia.value,item.id];}
      function toggleSelectAll(){selectedMedia.value=allSelected.value?[]:media.value.map(x=>x.id);}
      function insertSelected(){const ids=media.value.filter(x=>selectedMedia.value.includes(x.id)).map(x=>x.id);mobilePane.value='write';blockEditor.value?.insertMedia(ids,ids.length>1?'gallery':'image');}
      function onDragStart(index){dragFrom.value=index;}
      function onDragOver(index){if(dragFrom.value!==null&&dragFrom.value!==index)dragOver.value=index;}
      function onDragEnd(){dragFrom.value=null;dragOver.value=null;}
      async function onDrop(index){
        const from=dragFrom.value;onDragEnd();if(from===null||from===index)return;
        const before=media.value.slice(),next=before.slice();next.splice(index,0,next.splice(from,1)[0]);media.value=next;
        try{await A.reorderMedia(id.value,next.map(x=>x.relationId));}catch(e){media.value=before;fail(e);}
      }
      async function sortByCaptureTime(){if(!id.value)return;try{const count=await A.sortMediaByCaptureTime(id.value);media.value=await A.media(id.value);selectedMedia.value=[];message('已按拍摄时间重排 '+count+' 张图片');}catch(e){fail(e);}}
      async function removeSelected(){
        const targets=media.value.filter(x=>selectedMedia.value.includes(x.id));if(!targets.length)return;
        try{await confirm('确定删除选中的 '+targets.length+' 张图片吗？正文仍在使用的图片不会被删除。');}catch(_){return;}
        let removed=0,failed=0;
        for(const item of targets){try{await A.deleteMedia(item.relationId);media.value=media.value.filter(x=>x.relationId!==item.relationId);if(form.coverMediaId===item.id)form.coverMediaId=null;removed++;}catch(_){failed++;}}
        selectedMedia.value=[];if(removed)message('已删除 '+removed+' 张图片');if(failed)ElementPlus.ElMessage.warning(failed+' 张图片仍被正文使用，未删除');
      }
      function selectTemplate(item){
        selectedTemplate.value=item;templateData.value={};
        (item.definitionJson?.blocks||[]).forEach(block=>{
          if(block.type==='trip-info')templateData.value[block.id]={weather:'',mood:''};
          else if(['text','textarea','quote'].includes(block.type))templateData.value[block.id]={value:''};
          else if(block.type==='rating')templateData.value[block.id]={value:0,comment:''};
          else if(block.type==='checklist')templateData.value[block.id]=[];
          else if(block.type==='image')templateData.value[block.id]={mediaIds:null};
          else if(block.type==='gallery')templateData.value[block.id]={mediaIds:[]};
        });
      }
      function openTemplate(){templateDialog.value=true;if(selectedTemplate.value)selectTemplate(selectedTemplate.value);else if(templates.value.length)selectTemplate(templates.value[0]);}
      async function generateFromTemplate(){
        if(!selectedTemplate.value)return;
        if(form.contentJson.blocks?.length)try{await confirm('使用模板会替换当前正文，是否继续？');}catch(_){return;}
        generating.value=true;
        try{
          const result=await A.generateTemplate(selectedTemplate.value.id,{journalId:id.value,tripId:form.tripId,
            tripStopId:form.tripStopId,occurredOn:form.occurredOn,data:templateData.value});
          form.contentJson=window.JournalBlocks.normalize(result.contentJson);
          form.templateId=result.templateId;form.templateVersion=result.templateVersion;
          if(!form.title){const city=stops.value.find(x=>x.id===form.tripStopId)?.cityName;form.title=[city,selectedTemplate.value.name].filter(Boolean).join(' · ');}
          if(!form.slug&&form.occurredOn)form.slug='journal-'+form.occurredOn.replaceAll('-','')+'-'+Date.now().toString().slice(-5);
          templateDialog.value=false;
          if(result.skippedBlocks?.length)ElementPlus.ElMessage.info('没有数据，已跳过：'+result.skippedBlocks.join('、'));
        }catch(e){fail(e);}finally{generating.value=false;}
      }
      async function makePreviewLink(){if(!await save(true))return;try{const value=await A.createPreviewLink(id.value);previewLink.value=value.url||value.previewUrl||value.token;if(value.token&&!String(previewLink.value).startsWith('http'))previewLink.value=location.origin+'/#/preview/'+value.token;await navigator.clipboard?.writeText(previewLink.value);message('预览链接已复制');}catch(e){fail(e);}}
      function openPublished(){if(form.slug)window.open(location.origin+'/#/journals/'+encodeURIComponent(form.slug),'_blank','noopener');}
      function addTag(){const value=tagInput.value.trim();if(value&&!form.tags.includes(value))form.tags.push(value);tagInput.value='';}
      function removeTag(value){form.tags=form.tags.filter(x=>x!==value);}
      function backToTrip(){
        if(!form.tripId)return router.push('/trips');
        const tab=TAB_ORDER.includes(route.query.from)?route.query.from:'journals';
        router.push({path:'/trips/'+form.tripId,query:{tab}});
      }
      let timer=null;
      onMounted(()=>{load();timer=setInterval(()=>{if(id.value&&dirty.value&&!saving.value&&form.status==='DRAFT')save(true,true);},20000);});
      onBeforeUnmount(()=>clearInterval(timer));
      return{form,formRef,rules,id,trips,stops,media,templates,themes,pageLoading,saving,uploading,dirty,
        fileInput,blockEditor,metaCollapsed,wordCount,templateDialog,selectedTemplate,templateData,templateBlocks,
        generating,previewLink,autoSaveState,tagInput,save,publish,updatePublished,unpublish,picked,dropped,pasted,setCover,saveCaption,removeMedia,
        selectedMedia,allSelected,dragOver,mobilePane,toggleSelect,toggleSelectAll,insertSelected,onDragStart,onDragOver,onDragEnd,onDrop,sortByCaptureTime,removeSelected,
        selectTemplate,openTemplate,generateFromTemplate,makePreviewLink,openPublished,addTag,removeTag,backToTrip,statusLabel};
    },
    template:`
      <div v-loading="pageLoading" class="editor-page" element-loading-text="正在打开日记…" @paste="pasted">
        <div class="editor-top"><el-button link @click="backToTrip">← 返回</el-button><h2>{{id?'编辑旅行日记':'新建旅行日记'}}</h2>
          <span class="status">{{statusLabel(form.status)}}</span><span class="word-count">{{wordCount}} 字</span>
          <span v-if="autoSaveState" class="word-count">{{autoSaveState}}</span><div class="editor-actions">
            <el-button @click="openTemplate">{{form.templateId?'填写模板':'从模板开始'}}</el-button>
            <template v-if="form.status==='PUBLISHED'"><el-button @click="openPublished">查看文章</el-button><el-button @click="unpublish">撤回</el-button><el-button type="primary" :loading="saving" :disabled="!dirty" @click="updatePublished">更新发布</el-button></template>
            <template v-else><el-button :loading="saving" @click="save(false)">保存草稿</el-button><el-button :disabled="!id" @click="makePreviewLink">预览链接</el-button><el-button type="primary" @click="publish">发布日记</el-button></template>
          </div></div>
        <button type="button" class="editor-meta-toggle" :aria-expanded="!metaCollapsed" @click="metaCollapsed=!metaCollapsed">
          <span>{{metaCollapsed?(form.title||'日记信息'):'收起日记信息'}}</span><i class="editor-meta-toggle__chev" aria-hidden="true"></i>
        </button>
        <el-form ref="formRef" :model="form" :rules="rules" class="editor-meta-group editor-meta-form" :class="{collapsed:metaCollapsed}"><div class="editor-meta-inner">
          <div class="editor-meta"><el-form-item prop="title"><el-input v-model="form.title" placeholder="日记标题（必填）"/></el-form-item>
            <el-form-item prop="tripId"><el-select v-model="form.tripId" filterable placeholder="所属旅行（必填）"><el-option v-for="x in trips" :key="x.id" :label="x.title" :value="x.id"/></el-select></el-form-item>
            <el-form-item><el-select v-model="form.tripStopId" clearable placeholder="城市"><el-option v-for="x in stops" :key="x.id" :label="x.cityName" :value="x.id"/></el-select></el-form-item>
            <el-form-item prop="occurredOn"><el-date-picker :editable="$allowTextInput" v-model="form.occurredOn" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="发生日期（必填）"/></el-form-item></div>
          <div class="editor-meta editor-meta-secondary"><el-form-item prop="slug"><el-input v-model="form.slug" placeholder="slug（必填），例如 chengdu-winter"/></el-form-item>
            <el-form-item><el-input v-model="form.excerpt" maxlength="500" placeholder="摘要"/></el-form-item>
            <el-form-item><el-select v-model="form.themeKey" clearable placeholder="继承旅行 / 全站主题"><el-option v-for="x in themes" :key="x.themeKey" :label="x.name" :value="x.themeKey"/></el-select></el-form-item></div>
          <div class="editor-tags"><el-tag v-for="tag in form.tags" :key="tag" closable disable-transitions @close="removeTag(tag)">{{tag}}</el-tag>
            <el-input v-model="tagInput" size="small" class="tag-input" placeholder="加标签，回车确认" @keyup.enter="addTag"/></div>
          <div v-if="previewLink" class="preview-link-bar"><span>预览链接：</span><code>{{previewLink}}</code></div>
        </div></el-form>

        <div class="editor-mobile-tabs"><button type="button" :class="{active:mobilePane==='write'}" @click="mobilePane='write'">写日记</button><button type="button" :class="{active:mobilePane==='media'}" @click="mobilePane='media'">图片管理（{{media.length}}）</button></div>
        <div class="editor-grid block-editor-layout">
          <section class="editor-column editor-column--write" :class="{'mobile-active':mobilePane==='write'}"><div class="editor-label">日记内容 <small>点击区块之间的 ＋ 添加</small></div>
            <journal-block-editor ref="blockEditor" v-model="form.contentJson" :media="media"/></section>
          <aside class="editor-column media-column" :class="{'mobile-active':mobilePane==='media'}"><div class="editor-label">图片管理 <small>点击图片可放大预览</small></div>
            <label class="upload-box" :class="{uploading}" @dragover.prevent @drop.prevent="dropped">
              <input ref="fileInput" type="file" multiple accept="image/jpeg,image/png,image/webp" @change="picked">
              <strong>{{uploading?'正在上传…':'选择、拖放或粘贴图片'}}</strong><span>JPEG / PNG / WebP · 上传后可直接配置版式</span>
              <el-button type="primary" plain :disabled="uploading" @click.prevent="fileInput.click()">＋ 上传图片</el-button>
            </label>
            <div class="media-manager-toolbar"><el-checkbox :model-value="allSelected" @change="toggleSelectAll">全选</el-checkbox>
              <el-button link size="small" @click="sortByCaptureTime">按拍摄时间排序</el-button><small>可拖动调整顺序</small>
              <el-button v-if="selectedMedia.length" type="primary" size="small" @click="insertSelected">插入选中（{{selectedMedia.length}}）</el-button>
              <el-button v-if="selectedMedia.length" link type="danger" size="small" @click="removeSelected">删除选中</el-button></div>
            <div class="media-side"><article v-for="(item,index) in media" :key="item.relationId" class="media-item"
              :class="{'is-selected':selectedMedia.includes(item.id),'is-drag-over':dragOver===index}" draggable="true"
              @dragstart="onDragStart(index)" @dragover.prevent="onDragOver(index)" @dragend="onDragEnd" @drop.prevent="onDrop(index)">
              <el-checkbox class="media-item-check" :model-value="selectedMedia.includes(item.id)" @change="toggleSelect(item)"/>
              <el-image :src="item.thumbnailUrl||item.displayUrl" :preview-src-list="[item.displayUrl]" :alt="item.caption||item.filename" fit="cover" preview-teleported/>
              <div class="media-item-main"><el-input class="media-item-caption" v-model="item.caption" size="small" placeholder="图注（留空则不显示）" @change="saveCaption(item)"/>
                <div class="media-item-actions"><el-button link size="small" @click="mobilePane='write';blockEditor.insertMedia(item.id,'image')">插入</el-button>
                  <el-button link size="small" @click="setCover(item)">{{form.coverMediaId===item.id?'当前封面':'设封面'}}</el-button>
                  <el-button link type="danger" size="small" @click="removeMedia(item)">删除</el-button></div></div></article>
              <el-empty v-if="!media.length" :image-size="52" description="还没有图片"/></div>
          </aside>
        </div>

        <el-dialog v-model="templateDialog" title="用模板开始写作" width="min(980px,96vw)">
          <div class="template-writing"><aside class="template-choices"><button v-for="item in templates" :key="item.id" type="button"
            :class="{active:selectedTemplate?.id===item.id}" @click="selectTemplate(item)"><strong>{{item.name}}</strong><span>{{item.description}}</span><small>{{item.builtin?'系统模板':'我的模板'}}</small></button></aside>
            <section v-if="selectedTemplate" class="template-fields"><header><h3>{{selectedTemplate.name}}</h3><p>模板会一次生成可继续编辑的内容块，不会与正文长期绑定。</p></header>
              <div v-for="block in templateBlocks" :key="block.id" class="template-field">
                <template v-if="block.type==='trip-info'"><label>{{block.title}}</label><div class="form-grid form-grid-2"><el-input v-model="templateData[block.id].weather" placeholder="天气"/><el-input v-model="templateData[block.id].mood" placeholder="心情"/></div></template>
                <template v-else-if="['text','textarea','quote'].includes(block.type)"><label>{{block.title}} <em v-if="block.required">必填</em></label><el-input v-model="templateData[block.id].value" :type="block.type==='text'?'text':'textarea'" :rows="4" :placeholder="block.config?.placeholder||'填写内容'"/></template>
                <template v-else-if="block.type==='rating'"><label>{{block.title}}</label><el-rate v-model="templateData[block.id].value" :max="block.config?.max||5"/></template>
                <template v-else-if="block.type==='image'"><label>{{block.title}}</label><el-select v-model="templateData[block.id].mediaIds" clearable><el-option v-for="item in media" :key="item.id" :label="item.caption||item.filename" :value="item.id"/></el-select></template>
                <template v-else-if="block.type==='gallery'"><label>{{block.title}}</label><el-select v-model="templateData[block.id].mediaIds" multiple><el-option v-for="item in media" :key="item.id" :label="item.caption||item.filename" :value="item.id"/></el-select></template>
                <div v-else class="template-auto-block"><strong>{{block.title}}</strong><span>从当前旅行自动整理</span></div>
              </div></section></div>
          <template #footer><el-button @click="templateDialog=false">取消</el-button><el-button type="primary" :loading="generating" @click="generateFromTemplate">生成内容块</el-button></template>
        </el-dialog>
      </div>`
  };

  const TemplateManager = {
    setup() {
      const items=ref([]),loading=ref(false),dialog=ref(false),editing=ref(null);
      const previewDialog=ref(false),previewing=ref(null),previewEl=ref(null),builderPreviewEl=ref(null);
      // auto 标记的区块由旅行数据自动填充，查不到数据就整块不生成——说明里必须讲清楚取的是什么
      const blockTypes=[
        {value:'trip-info',label:'旅行信息',auto:true,desc:'自动带出：日记日期、所选城市、旅行标题，再加上你填的天气和心情，渲染成一行引用。'},
        {value:'text',label:'单行文字',desc:'一个单行输入框，写标题式的短句。填写提示语可以在这里预设。'},
        {value:'textarea',label:'长文字',desc:'多行输入框，正文主体一般用这个。'},
        {value:'quote',label:'引用',desc:'你填的内容会渲染成引用块，适合放当天最想记住的一句话。'},
        {value:'rating',label:'评分',desc:'星级评分，生成为 ★★★★☆（4/5）这样的文字。可设置满分。'},
        {value:'checklist',label:'清单',desc:'待办、行李或打卡清单。'},
        {value:'route',label:'路线',auto:true,desc:'自动带出路线。「当天行程」按日记日期取当天行程条目的标题；「旅行城市」取整趟旅行的城市顺序。对应来源没有记录时，这一块不会生成。'},
        {value:'itinerary',label:'行程',auto:true,desc:'自动带出日记当天的行程条目，按时间排成列表（时间 + 标题 + 地址）。当天没有行程记录时，这一块不会生成。'},
        {value:'expense-summary',label:'花费汇总',auto:true,desc:'自动带出支出并按预算分类合计。「当天」只统计日记日期当天的支出，「整趟旅行」统计这次旅行的全部支出。对应范围内没有支出记录时，这一块不会生成。'},
        {value:'image',label:'单图',desc:'填写日记时从已上传图片里选一张插入，可设尺寸和对齐。'},
        {value:'gallery',label:'照片墙',desc:'填写日记时选多张图片，按设定的排布方式生成图组。'},
        {value:'divider',label:'分隔线',desc:'一条水平分隔线，用来断开段落。'}
      ];
      const blockMeta=type=>blockTypes.find(x=>x.value===type)||{};
      const form=reactive({name:'',description:'',category:'CUSTOM',enabled:true,definitionJson:{title:'',blocks:[]}});
      async function load(){loading.value=true;try{items.value=await A.templates(false);}catch(e){fail(e);}finally{loading.value=false;}}
      function reset(){editing.value=null;Object.assign(form,{name:'',description:'',category:'CUSTOM',enabled:true,definitionJson:{title:'',blocks:[]}});}
      function create(){reset();dialog.value=true;}
      function edit(item){editing.value=item.id;Object.assign(form,{name:item.name,description:item.description||'',category:item.category||'CUSTOM',enabled:item.enabled,definitionJson:JSON.parse(JSON.stringify(item.definitionJson))});dialog.value=true;}
      function blockLabel(type){return blockTypes.find(x=>x.value===type)?.label||type;}
      // 用示例数据把区块渲染成成稿的样子——系统模板和正在编辑的模板走同一条路
      const sampleHtml=blocks=>window.JournalBlocks.render(renderTemplateSample(blocks),[]);
      const builderPreview=computed(()=>sampleHtml(form.definitionJson.blocks));
      const previewHtml=computed(()=>previewing.value?sampleHtml(previewing.value.definitionJson?.blocks):'');
      function preview(item){previewing.value=item;previewDialog.value=true;}
      // 预览里也可能有轮播和前后对比，同样要在渲染后补结构
      watch(builderPreview,()=>nextTick(()=>{JM.teardown(builderPreviewEl.value);JM.enhance(builderPreviewEl.value);}));
      watch(previewHtml,()=>nextTick(()=>{JM.teardown(previewEl.value);JM.enhance(previewEl.value);}));
      function addBlock(type){const label=blockLabel(type),config={};if(['text','textarea','quote'].includes(type))config.placeholder='写下这一段';if(['image','gallery'].includes(type)){config.imageSize='medium';config.align='center';}if(type==='gallery')config.layout='grid';if(type==='rating')config.max=5;if(type==='route')config.source='itinerary';if(type==='expense-summary')config.source='expense';form.definitionJson.blocks.push({id:'block_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,5),type,title:label,required:false,config});}
      function move(index,offset){const target=index+offset;if(target<0||target>=form.definitionJson.blocks.length)return;const [block]=form.definitionJson.blocks.splice(index,1);form.definitionJson.blocks.splice(target,0,block);}
      function copyBlock(index){const source=form.definitionJson.blocks[index],copy=JSON.parse(JSON.stringify(source));copy.id='block_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,5);copy.title+=' 副本';form.definitionJson.blocks.splice(index+1,0,copy);}
      async function save(){if(!form.definitionJson.blocks.length)return ElementPlus.ElMessage.warning('请至少添加一个区块');try{const body={name:form.name,description:form.description,category:form.category,enabled:form.enabled,definitionJson:{title:form.name,blocks:form.definitionJson.blocks}};editing.value?await A.updateTemplate(editing.value,body):await A.createTemplate(body);dialog.value=false;message('模板已保存');load();}catch(e){fail(e);}}
      async function duplicate(item){try{const copy=await A.duplicateTemplate(item.id);message('已复制为“'+copy.name+'”');load();}catch(e){fail(e);}}
      async function remove(item){try{await confirm('确定删除模板“'+item.name+'”吗？');await A.deleteTemplate(item.id);message('模板已删除');load();}catch(e){if(e!=='cancel'&&e!=='close')fail(e);}}
      onMounted(load);
      return{items,loading,dialog,editing,form,blockTypes,blockMeta,previewDialog,previewing,previewHtml,builderPreview,previewEl,builderPreviewEl,
             load,create,edit,preview,blockLabel,addBlock,move,copyBlock,save,duplicate,remove};
    },
    template:`<div><div class="page-head"><div><h2>日记模板</h2><p>把常写的结构保存下来，下次只填当时的天气、心情和故事。</p></div><el-button type="primary" @click="create">新建我的模板</el-button></div>
      <div v-loading="loading" class="template-card-grid"><article v-for="item in items" :key="item.id" class="panel template-card"><header><span>{{item.builtin?'系统模板':'我的模板'}}</span><small>第 {{item.version}} 版</small></header><h3>{{item.name}}</h3><p>{{item.description||'还没有模板说明'}}</p><div class="template-block-tags"><i v-for="block in item.definitionJson.blocks.slice(0,6)" :key="block.id">{{block.title||blockLabel(block.type)}}</i></div><footer><el-button link @click="preview(item)">预览</el-button><el-button link @click="duplicate(item)">复制</el-button><template v-if="!item.builtin"><el-button link type="primary" @click="edit(item)">编辑</el-button><el-button link type="danger" @click="remove(item)">删除</el-button></template></footer></article></div>
      <el-dialog v-model="previewDialog" :title="(previewing?.name||'模板')+' · 预览'" width="min(860px,96vw)" class="template-preview-dialog"><p class="template-preview-note">下面是用示例旅行数据渲染的效果，实际生成时会换成这篇日记所属旅行的真实内容。</p><article ref="previewEl" class="preview journal-document template-preview-body" v-html="previewHtml"></article><template #footer><el-button @click="previewDialog=false">关闭</el-button><el-button v-if="previewing" type="primary" @click="previewDialog=false;duplicate(previewing)">复制为我的模板</el-button></template></el-dialog>
      <el-dialog v-model="dialog" :title="editing?'编辑我的模板':'新建我的模板'" width="min(1320px,96vw)" class="template-editor-dialog"><el-form label-position="top"><div class="form-grid form-grid-2"><el-form-item label="模板名称"><el-input v-model="form.name" maxlength="120" placeholder="例如：海边慢游的一天"/></el-form-item><el-form-item label="是否启用"><el-switch v-model="form.enabled" active-text="启用" inactive-text="停用"/></el-form-item></div><el-form-item label="模板说明"><el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" show-word-limit/></el-form-item></el-form>
        <div class="block-library"><span>添加区块</span><el-tooltip v-for="type in blockTypes" :key="type.value" :content="type.desc" placement="top" :show-after="200" popper-class="block-tip"><button type="button" :class="{auto:type.auto}" @click="addBlock(type.value)">＋ {{type.label}}<i v-if="type.auto" aria-hidden="true">自动</i></button></el-tooltip></div>
        <div class="template-workbench">
        <div class="template-builder"><el-empty v-if="!form.definitionJson.blocks.length" description="从上方添加第一个区块"/><article v-for="(block,index) in form.definitionJson.blocks" :key="block.id" class="template-block-editor"><div class="block-order"><button type="button" :disabled="index===0" @click="move(index,-1)">↑</button><strong>{{index+1}}</strong><button type="button" :disabled="index===form.definitionJson.blocks.length-1" @click="move(index,1)">↓</button></div><div class="block-fields"><div class="block-title-row"><el-input v-model="block.title" placeholder="区块标题，显示为正文里的小标题"><template #prepend>{{blockLabel(block.type)}}</template></el-input><el-switch v-model="block.required" active-text="必填" inactive-text="选填"/></div>
              <p class="block-desc">{{blockMeta(block.type).desc}}</p>
              <el-input v-if="['text','textarea','quote'].includes(block.type)" v-model="block.config.placeholder" placeholder="填写提示语"/>
              <el-select v-if="block.type==='route'" v-model="block.config.source"><el-option label="路线来源：当天行程条目" value="itinerary"/><el-option label="路线来源：整趟旅行的城市顺序" value="trip"/></el-select>
              <el-select v-if="block.type==='expense-summary'" v-model="block.config.source"><el-option label="统计范围：日记当天的支出" value="expense"/><el-option label="统计范围：整趟旅行的全部支出" value="trip"/></el-select>
              <el-input-number v-if="block.type==='rating'" v-model="block.config.max" :min="3" :max="10" controls-position="right" style="width:140px"/><div v-if="['image','gallery'].includes(block.type)" class="form-grid form-grid-2"><el-select v-model="block.config.imageSize"><el-option label="小图" value="small"/><el-option label="中图" value="medium"/><el-option label="大图" value="large"/><el-option label="满宽" value="full"/><el-option label="通栏出血" value="bleed"/></el-select><el-select v-model="block.config.align"><el-option label="居左" value="left"/><el-option label="居中" value="center"/><el-option label="居右" value="right"/></el-select></div><el-select v-if="block.type==='gallery'" v-model="block.config.layout" placeholder="图组排布"><el-option label="竖向逐张排列" value="stack"/><el-option label="并排" value="row"/><el-option label="网格" value="grid"/><el-option label="瀑布流" value="masonry"/><el-option label="拼贴" value="mosaic"/><el-option label="杂志" value="magazine"/><el-option label="故事流" value="story"/><el-option label="错落画廊" value="staggered"/><el-option label="轮播" value="carousel"/><el-option label="胶片条" value="filmstrip"/><el-option label="前后对比" value="compare"/></el-select></div><div class="block-actions"><button type="button" @click="copyBlock(index)">复制</button><button type="button" class="danger" @click="form.definitionJson.blocks.splice(index,1)">删除</button></div></article></div>
        <aside class="template-live-preview"><div class="template-live-head">实时预览<small>示例数据</small></div><article ref="builderPreviewEl" class="preview journal-document template-preview-body" v-html="builderPreview"></article><div v-if="!form.definitionJson.blocks.length" class="template-live-empty">添加区块后这里会显示生成的日记长什么样</div></aside>
        </div>
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
      // 昵称就地编辑：点一下变输入框，回车或失焦保存，Esc 放弃
      const editingName = ref(false);
      const nameDraft = ref('');
      const savingName = ref(false);
      function startEditName() { nameDraft.value = session.user?.displayName || ''; editingName.value = true; }
      function cancelEditName() { editingName.value = false; }
      async function saveName() {
        if (!editingName.value) return;
        const next = nameDraft.value.trim();
        if (!next) return fail(new Error('昵称不能为空'));
        if (next === session.user?.displayName) return cancelEditName();
        savingName.value = true;
        try {
          const updated = await api.auth.updateDisplayName({ displayName: next });
          session.user = { ...session.user, ...updated };
          editingName.value = false;
          message('昵称已更新');
        } catch (error) { fail(error); }
        finally { savingName.value = false; }
      }
      // 备份体积可能很大，用 a[download] 让浏览器直接接管下载，
      // 不经 axios 收进内存。会话 Cookie 会随普通导航一起带上。
      function download(includePhotos) {
        const link = document.createElement('a');
        link.href = A.backupUrl(includePhotos);
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        message('已开始导出，文件较大时请稍候');
      }
      return { session, avatarInput, avatarUrl, uploading, password, changingPassword, download, chooseAvatar, picked, changePassword,
               editingName, nameDraft, savingName, startEditName, cancelEditName, saveName };
    },
    template: `
      <div><div class="page-head"><div><h2>个人资料</h2><p>管理昵称、登录密码和网站展示头像。</p></div></div>
        <div class="profile-grid">
          <section class="panel panel-pad profile-card"><h3>头像与昵称</h3>
            <div class="profile-avatar"><img v-if="avatarUrl" :src="avatarUrl" alt="管理员头像"><span v-else>{{session.user?.displayName?.slice(0,1) || '旅'}}</span></div>
            <div class="profile-name">
              <div v-if="!editingName" class="profile-name-view"><strong>{{session.user?.displayName}}</strong><el-button link size="small" @click="startEditName">改昵称</el-button></div>
              <div v-else class="profile-name-edit"><el-input v-model="nameDraft" size="small" maxlength="60" show-word-limit placeholder="前台展示的昵称" @keyup.enter="saveName" @keyup.esc="cancelEditName"/><el-button link size="small" :loading="savingName" @click="saveName">保存</el-button><el-button link size="small" @click="cancelEditName">取消</el-button></div>
              <p>{{session.user?.username}}<small class="form-hint">登录用户名，不可修改</small></p>
            </div>
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
          <section class="panel panel-pad backup-card"><h3>备份导出</h3>
            <p>把全部旅行、行程、预算和日记导出成一个 zip：每篇日记一份可恢复的 Block JSON，照片按日记分目录，另有 manifest.json 保存完整结构化数据。</p>
            <p class="backup-note">内容存在数据库和对象存储两处，导出是换服务器、换方案或哪天不想维护了的退路。建议定期存一份到本地。</p>
            <div class="backup-actions">
              <el-button type="primary" @click="download(true)">导出全部（含照片）</el-button>
              <el-button @click="download(false)">仅导出文字</el-button>
            </div>
          </section>
        </div>
      </div>`
  };

  const Theme = {
    setup() {
      const themes=ref([]),changing=ref(''),saving=ref(false),editor=ref(false),editing=ref(null),previewFrame=ref(null),previewMode=ref('desktop'),importInput=ref(null);
      const history=ref([]),historyIndex=ref(-1);
      let historyTimer=null,restoring=false,originalSnapshot='';
      // 预览 iframe 的模拟视口宽度。前台 public.css 的断点是按视口宽度判断的，
      // 而 iframe 内部的视口就是它自身宽度——面板只有 800 出头，会直接落进
      // max-width:900px 的移动端断点，于是「桌面」预览显示的其实是手机布局。
      // 解决办法：iframe 按真实桌面宽度渲染，再用 transform 缩放塞进面板。
      // 桌面不给高度：浏览器窗口高度本来就不固定，让它填满面板能多看到些内容。
      // 手机必须给高度：机身比例是固定的，只按宽度缩放会把 390×844 压成 390×610。
      const PREVIEW_VIEWPORTS={desktop:{width:1280,height:null},mobile:{width:390,height:844}};
      const previewWrap=ref(null);
      const previewBox=reactive({scale:1,frameWidth:PREVIEW_VIEWPORTS.desktop.width,frameHeight:800,stageWidth:PREVIEW_VIEWPORTS.desktop.width,stageHeight:800});
      const stageStyle=computed(()=>({width:previewBox.stageWidth+'px',height:previewBox.stageHeight+'px'}));
      const frameStyle=computed(()=>({width:previewBox.frameWidth+'px',height:previewBox.frameHeight+'px',transform:'scale('+previewBox.scale+')'}));
      let previewObserver=null;
      function measurePreview(){
        const wrap=previewWrap.value;
        if(!wrap)return;
        const styles=getComputedStyle(wrap);
        const available=wrap.clientWidth-parseFloat(styles.paddingLeft||0)-parseFloat(styles.paddingRight||0);
        const height=wrap.clientHeight-parseFloat(styles.paddingTop||0)-parseFloat(styles.paddingBottom||0);
        if(available<=0||height<=0)return;
        const viewport=PREVIEW_VIEWPORTS[previewMode.value]||PREVIEW_VIEWPORTS.desktop;
        // 只缩不放。定高的（手机）要同时受宽高约束，机身比例才不会变形；
        // 不定高的（桌面）只按宽度缩，高度反过来由面板高度推算。
        const scale=viewport.height
          ? Math.min(1,available/viewport.width,height/viewport.height)
          : Math.min(1,available/viewport.width);
        const frameHeight=viewport.height||height/scale;
        previewBox.scale=scale;
        previewBox.frameWidth=viewport.width;
        previewBox.frameHeight=frameHeight;
        // 外层占位用缩放后的尺寸，避免未缩放的宽度把面板撑出滚动条
        previewBox.stageWidth=viewport.width*scale;
        previewBox.stageHeight=frameHeight*scale;
      }
      const colorFields=[['background','页面背景'],['surface','内容背景'],['surfaceSoft','柔和背景'],['primary','主要文字'],['primarySoft','次级主色'],['secondary','辅助色'],['accent','强调操作'],['accentHover','强调悬停'],['sand','装饰沙色'],['text','正文颜色'],['muted','弱化文字'],['border','边框颜色'],['danger','危险提示'],['gradientFrom','渐变起色'],['gradientTo','渐变止色']];
      // 必须和后端 ThemePresetService.SCHEMA 的默认值保持一致：
      // completeDefinition 用它补齐缺失区块，缺了哪个区块对应的控件就会报错。
      const defaultDefinition={
        colors:{background:'#F7F2E8',surface:'#FFFCF6',surfaceSoft:'#F1E7D7',primary:'#264A3D',primarySoft:'#42685A',secondary:'#7A8B7F',accent:'#C76D4B',accentHover:'#B65B3B',sand:'#DFC9A8',text:'#2A2D2B',muted:'#77736B',border:'#E6DAC8',danger:'#B7483E',gradientFrom:'#F7F2E8',gradientTo:'#F1E7D7',scheme:'light'},
        typography:{headingFamily:'serif',bodyFamily:'sans',bodySize:16,lineHeight:1.8,letterSpacing:0,headingWeight:700,paragraphSpacing:1.2,headingStyle:'plain'},
        shape:{cardRadius:12,imageRadius:8,buttonRadius:8,borderWidth:1},
        layout:{contentWidth:1200,articleWidth:760,sectionGap:1,density:'comfortable',homeLayout:'editorial',journalLayout:'single'},
        card:{style:'border',opacity:1,blur:0},
        background:{style:'solid',texture:'none',intensity:0.4,mediaId:null},
        image:{style:'natural',shadow:'soft',defaultRatio:'16:9',frame:'none',tone:'none',width:'medium',maxHeight:75},
        gallery:{layout:'grid',columns:3,gap:10},
        motion:{level:'subtle',hover:'lift',entrance:true,scrollReveal:false},
        effects:{particles:'none',grain:false,lightLeak:false,vignette:false},
        map:{style:'auto',routeColor:'#C76D4B',routeWidth:3,markerStyle:'dot',animateRoute:false},
        hero:{mediaId:null}};

      /**
       * 高级自定义的控件表。一个 token 一行，模板用 v-for 渲染，
       * 新增可调项时后端 SCHEMA 加一行、这里加一行即可，不用改模板结构。
       */
      const settingGroups=[
        {key:'typography',label:'字体与排版',fields:[
          {key:'headingFamily',label:'标题字体',type:'select',options:[['serif','杂志衬线'],['sans','现代无衬线'],['rounded','圆润黑体'],['mono','等宽字体']]},
          {key:'bodyFamily',label:'正文字体',type:'select',options:[['sans','清晰无衬线'],['serif','沉浸衬线'],['rounded','圆润黑体'],['mono','等宽字体']]},
          {key:'headingStyle',label:'标题装饰',type:'select',options:[['plain','无装饰'],['underline','下划线'],['bar','左侧竖条'],['serif-caps','小型大写'],['outline','描边空心']]},
          {key:'bodySize',label:'正文字号',type:'number',min:14,max:22,step:1},
          {key:'lineHeight',label:'正文行高',type:'number',min:1.4,max:2.4,step:0.05},
          {key:'letterSpacing',label:'字间距 (em)',type:'number',min:-0.02,max:0.24,step:0.01},
          {key:'headingWeight',label:'标题字重',type:'number',min:400,max:900,step:50},
          {key:'paragraphSpacing',label:'段间距 (em)',type:'number',min:0.6,max:2.4,step:0.05}
        ]},
        {key:'shape',label:'圆角与描边',fields:[
          {key:'cardRadius',label:'卡片圆角',type:'number',min:0,max:32,step:1},
          {key:'imageRadius',label:'图片圆角',type:'number',min:0,max:32,step:1},
          {key:'buttonRadius',label:'按钮圆角',type:'number',min:0,max:32,step:1},
          {key:'borderWidth',label:'描边粗细',type:'number',min:0,max:4,step:1}
        ]},
        {key:'layout',label:'页面布局',fields:[
          {key:'homeLayout',label:'首页布局',type:'select',options:[['editorial','旅行杂志'],['classic','整齐卡片'],['bento','Bento 格'],['magazine','杂志栅格'],['timeline','时间轴'],['masonry','瀑布流']]},
          {key:'journalLayout',label:'日记布局',type:'select',options:[['single','标准单栏'],['wide','宽栏'],['immersive','沉浸式'],['scrapbook','手账式']]},
          {key:'density',label:'内容密度',type:'select',options:[['compact','紧凑'],['comfortable','舒适'],['relaxed','宽松']]},
          {key:'contentWidth',label:'内容宽度',type:'number',min:960,max:1600,step:20},
          {key:'articleWidth',label:'文章宽度',type:'number',min:600,max:1000,step:20},
          {key:'sectionGap',label:'区块间距倍数',type:'number',min:0.6,max:2.2,step:0.05}
        ]},
        {key:'card',label:'卡片风格',fields:[
          {key:'style',label:'卡片外观',type:'select',options:[['flat','无边无影'],['border','描边'],['shadow','投影'],['glass','玻璃拟态'],['paper','纸片'],['polaroid','拍立得'],['film','胶片']]},
          {key:'opacity',label:'卡片不透明度',type:'number',min:0.4,max:1,step:0.02},
          {key:'blur',label:'毛玻璃模糊',type:'number',min:0,max:24,step:1}
        ]},
        {key:'background',label:'页面背景',fields:[
          {key:'style',label:'背景类型',type:'select',options:[['solid','纯色'],['gradient','渐变'],['image','图片']]},
          {key:'texture',label:'叠加纹理',type:'select',options:[['none','无'],['paper','纸纹'],['grain','胶片颗粒'],['noise','噪点'],['dots','圆点'],['grid','网格'],['topo','等高线']]},
          {key:'intensity',label:'纹理强度',type:'number',min:0,max:1,step:0.05}
        ]},
        {key:'image',label:'图片默认版式',hint:'日记里逐张选过的版式优先，这里只影响没单独设置过的图片',fields:[
          {key:'width',label:'默认宽度',type:'select',options:[['small','小图 42%'],['medium','中图 68%'],['large','大图 90%'],['full','通栏 100%']]},
          {key:'maxHeight',label:'最大高度 (vh)',type:'number',min:30,max:100,step:5},
          {key:'defaultRatio',label:'默认比例',type:'select',options:[['natural','原始比例'],['16:9','16:9'],['4:3','4:3'],['1:1','1:1'],['3:4','3:4']]},
          {key:'frame',label:'相框风格',type:'select',options:[['none','无'],['line','细线'],['paper','相纸'],['float','悬浮'],['polaroid','拍立得'],['film','胶片'],['postcard','明信片']]},
          {key:'tone',label:'滤镜',type:'select',options:[['none','原色'],['warm','暖调'],['vintage','复古'],['mono','黑白']]},
          {key:'shadow',label:'图片阴影',type:'select',options:[['none','无'],['soft','轻柔'],['floating','悬浮']]},
          {key:'style',label:'图片风格',type:'select',options:[['natural','自然'],['rounded','柔和圆角'],['paper','相纸']]}
        ]},
        {key:'gallery',label:'多图布局',fields:[
          {key:'layout',label:'默认排布',type:'select',options:[['grid','网格'],['masonry','瀑布流'],['row','等高一行'],['mosaic','马赛克'],['magazine','杂志'],['carousel','轮播'],['filmstrip','胶片条']]},
          {key:'columns',label:'列数',type:'number',min:2,max:4,step:1},
          {key:'gap',label:'图片间距',type:'number',min:0,max:32,step:2}
        ]},
        {key:'motion',label:'动效',fields:[
          {key:'level',label:'动效强度',type:'select',options:[['none','关闭'],['subtle','轻微'],['standard','标准'],['strong','强烈']]},
          {key:'hover',label:'悬停反馈',type:'select',options:[['none','无'],['lift','浮起'],['zoom','放大'],['tilt','倾斜']]},
          {key:'entrance',label:'进入动画',type:'switch'},
          {key:'scrollReveal',label:'滚动揭示',type:'switch'}
        ]},
        {key:'effects',label:'页面特效',hint:'默认全关，开启后会常驻运行；系统开启「减少动态效果」时自动失效',fields:[
          {key:'particles',label:'粒子效果',type:'select',options:[['none','关闭'],['snow','雪'],['sakura','樱花'],['leaves','落叶'],['stars','星空'],['dust','浮尘']]},
          {key:'grain',label:'胶片颗粒',type:'switch'},
          {key:'lightLeak',label:'漏光',type:'switch'},
          {key:'vignette',label:'暗角',type:'switch'}
        ]},
        {key:'map',label:'地图视觉',fields:[
          {key:'style',label:'地图色调',type:'select',options:[['auto','跟随明暗'],['light','明亮'],['dark','暗色'],['vintage','复古'],['terrain','地形增强']]},
          {key:'markerStyle',label:'标记样式',type:'select',options:[['dot','圆点'],['pin','水滴'],['ring','圆环'],['photo','大圆点']]},
          {key:'routeColor',label:'路线颜色',type:'color'},
          {key:'routeWidth',label:'路线粗细',type:'number',min:1,max:8,step:1},
          {key:'animateRoute',label:'路线绘制动画',type:'switch'}
        ]}
      ];
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
      // 把当前设计推给预览 iframe。改一个颜色就会触发一次，所以预览页没能正常加载时
      // （contentWindow 的 origin 变成 null，postMessage 直接抛错）要吞掉异常，
      // 否则控制台会被同一条报错刷屏——真正的原因浏览器自己已经报出来了。
      function postPreview(){nextTick(()=>{
        const frame=previewFrame.value?.contentWindow;
        if(!frame)return;
        try{frame.postMessage({type:'travel-theme-preview',theme:{themeKey:'preview',baseThemeKey:form.baseThemeKey,definitionJson:deep(form.definitionJson)}},location.origin);}
        catch(_){}
      });}
      function exportTheme(item){const payload={schemaVersion:1,name:item.name,description:item.description,baseThemeKey:item.baseThemeKey,previewImageUrl:item.previewImageUrl,definitionJson:item.definitionJson};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=item.themeKey+'.json';link.click();URL.revokeObjectURL(link.href);}
      function chooseImport(){importInput.value.click();}
      async function imported(event){const file=event.target.files[0];event.target.value='';if(!file)return;try{const data=JSON.parse(await file.text());if(!data.definitionJson)throw new Error('文件中缺少 definitionJson');assignSnapshot({name:(data.name||'导入的主题')+' · 导入',description:data.description||'',baseThemeKey:data.baseThemeKey||'travel-classic',previewImageUrl:data.previewImageUrl||'',enabled:true,definitionJson:data.definitionJson});editing.value=null;editor.value=true;nextTick(()=>{seedHistory();postPreview();});}catch(e){fail(new Error('导入失败：'+e.message));}}
      // ——— 预设 ———
      // 预设就是 builtin 的主题记录，套用时只替换视觉配置，保留用户已填的名称和说明，
      // 这样「先起名 → 挑个预设打底 → 再微调」这条路走得通。
      const builtinThemes=computed(()=>themes.value.filter(item=>item.builtin));
      function applyPreset(item){
        form.definitionJson=completeDefinition(item.definitionJson);
        message('已套用「'+item.name+'」，可以继续微调');
      }
      /** 预设色卡：用背景 / 主色 / 强调色三段拼一个小色条 */
      function presetSwatch(item){
        const c=item.definitionJson?.colors||{};
        return {background:'linear-gradient(90deg,'+(c.background||'#eee')+' 0 34%,'+(c.primary||'#666')+' 34% 67%,'+(c.accent||'#c76d4b')+' 67% 100%)'};
      }

      // ——— 首页封面图 ———
      // 只在配置里存 media id，展示地址前端自己拼。上传后立刻推给预览，
      // 但要等主题保存才真正生效（definitionJson 随主题一起提交）。
      const heroInput=ref(null),heroUploading=ref(false);
      const heroUrl=computed(()=>{
        const id=form.definitionJson.hero?.mediaId;
        return id?'/api/media/'+id+'/display':'';
      });
      function chooseHero(){heroInput.value?.click();}
      async function heroPicked(event){
        const file=event.target.files?.[0];
        event.target.value='';
        if(!file)return;
        heroUploading.value=true;
        try{
          const body=new FormData();
          body.append('file',file);
          const asset=await A.uploadThemeHero(body);
          if(!form.definitionJson.hero)form.definitionJson.hero={mediaId:null};
          form.definitionJson.hero.mediaId=asset.id;
          message('封面已上传，保存主题后生效');
        }catch(e){fail(e);}
        finally{heroUploading.value=false;}
      }
      function clearHero(){if(form.definitionJson.hero)form.definitionJson.hero.mediaId=null;}
      function luminance(hex){const values=String(hex).replace('#','').match(/.{2}/g)?.map(x=>parseInt(x,16)/255)||[0,0,0];return values.map(x=>x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4)).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);}
      function contrastRatio(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
      watch(form,()=>{postPreview();if(restoring||!editor.value)return;clearTimeout(historyTimer);historyTimer=setTimeout(pushHistory,280);},{deep:true});
      // 弹窗是 destroy-on-close，每次打开都是新元素，所以监听 ref 本身而不是只在挂载时接一次
      watch(previewWrap,element=>{
        previewObserver?.disconnect();
        previewObserver=null;
        if(!element)return;
        previewObserver=new ResizeObserver(measurePreview);
        previewObserver.observe(element);
      });
      watch(previewMode,()=>nextTick(measurePreview));
      onMounted(load);
      onBeforeUnmount(()=>{clearTimeout(historyTimer);previewObserver?.disconnect();});
      return {session,themes,changing,editor,editing,previewFrame,previewMode,previewWrap,stageStyle,frameStyle,importInput,form,colorFields,settingGroups,builtinThemes,applyPreset,presetSwatch,contrast,canUndo,canRedo,heroInput,heroUploading,heroUrl,chooseHero,heroPicked,clearHero,selectTheme,openEditor,duplicateTheme,saveTheme,removeTheme,postPreview,exportTheme,chooseImport,imported,undo,redo,resetEditor};
    },
    template: `<div><div class="page-head"><div><h2>主题外观</h2><p>选择预设，或设计自己的色彩、字体、布局与图片风格；公开网站会同步更新。</p></div><div class="theme-page-actions"><input ref="importInput" type="file" accept="application/json" hidden @change="imported"><el-button @click="chooseImport">导入 JSON</el-button><el-button type="primary" @click="openEditor(null,true)">新建设计</el-button></div></div>
      <div class="theme-grid"><article v-for="item in themes" :key="item.themeKey" class="panel theme-preview" :class="{selected:session.user?.themeKey===item.themeKey}">
        <img :src="item.previewImageUrl||'/img/theme-travel-classic-preview.png'" :alt="item.name"><div class="theme-info"><div><div class="theme-card-title"><h3>{{item.name}}</h3><small>{{item.builtin?'系统预设':'我的主题'}} · v{{item.version}}</small></div><p>{{item.description}}</p></div><span v-if="session.user?.themeKey===item.themeKey" class="theme-badge">当前主题</span></div>
        <footer class="theme-card-actions"><el-button v-if="session.user?.themeKey!==item.themeKey" type="primary" :loading="changing===item.themeKey" @click="selectTheme(item)">使用</el-button><el-button v-if="!item.builtin" @click="openEditor(item)">设计</el-button><el-button @click="duplicateTheme(item)">复制</el-button><el-button @click="exportTheme(item)">导出</el-button><el-button v-if="!item.builtin" type="danger" link @click="removeTheme(item)">删除</el-button></footer>
      </article></div>
      <el-dialog v-model="editor" class="theme-designer-dialog" :title="editing?'设计主题':'新建主题'" width="min(1240px,97vw)" destroy-on-close>
        <div class="theme-designer"><section class="theme-controls"><div class="theme-history"><el-button size="small" :disabled="!canUndo" @click="undo">撤销</el-button><el-button size="small" :disabled="!canRedo" @click="redo">重做</el-button><el-button size="small" @click="resetEditor">恢复打开时状态</el-button></div>
          <div class="theme-basic"><label>主题名称<el-input v-model="form.name" maxlength="100"/></label><label>主题说明<el-input v-model="form.description" type="textarea" :rows="2" maxlength="500"/></label>
            <label>首页封面图
              <div class="hero-picker">
                <div class="hero-preview" :class="{empty:!heroUrl}" :style="heroUrl?{backgroundImage:'url('+heroUrl+')'}:null"><span v-if="!heroUrl">使用默认封面</span></div>
                <div class="hero-actions"><el-button size="small" :loading="heroUploading" @click="chooseHero">{{heroUrl?'更换封面':'上传封面'}}</el-button><el-button v-if="heroUrl" size="small" link type="danger" @click="clearHero">恢复默认</el-button></div>
                <input ref="heroInput" hidden type="file" accept="image/jpeg,image/png,image/webp" @change="heroPicked">
                <small>显示在前台首页首屏右侧，建议横图；保存主题后生效。</small>
              </div>
            </label>
          </div>
          <div class="preset-row"><span class="preset-row-label">从预设开始</span><div class="preset-chips"><button v-for="item in builtinThemes" :key="item.themeKey" type="button" class="preset-chip" @click="applyPreset(item)"><i :style="presetSwatch(item)"></i><span>{{item.name}}</span></button></div></div>
          <details open><summary>色彩</summary>
            <label class="scheme-toggle">明暗基调<el-radio-group v-model="form.definitionJson.colors.scheme" size="small"><el-radio-button value="light">亮色</el-radio-button><el-radio-button value="dark">暗色</el-radio-button></el-radio-group></label>
            <div class="theme-color-grid"><label v-for="item in colorFields" :key="item[0]"><span>{{item[1]}}</span><el-color-picker v-model="form.definitionJson.colors[item[0]]"/><code>{{form.definitionJson.colors[item[0]]}}</code></label></div>
            <div class="contrast-note" :class="{warn:!contrast.ok}">正文与背景对比度 {{contrast.ratio}}:1 · {{contrast.ok?'阅读对比度良好':'建议达到 4.5:1 以上'}}</div>
          </details>
          <details v-for="group in settingGroups" :key="group.key"><summary>{{group.label}}</summary>
            <p v-if="group.hint" class="group-hint">{{group.hint}}</p>
            <div class="theme-setting-grid">
              <label v-for="field in group.fields" :key="field.key">{{field.label}}
                <el-select v-if="field.type==='select'" v-model="form.definitionJson[group.key][field.key]"><el-option v-for="opt in field.options" :key="opt[0]" :label="opt[1]" :value="opt[0]"/></el-select>
                <el-input-number v-else-if="field.type==='number'" v-model="form.definitionJson[group.key][field.key]" :min="field.min" :max="field.max" :step="field.step" controls-position="right"/>
                <el-switch v-else-if="field.type==='switch'" v-model="form.definitionJson[group.key][field.key]"/>
                <el-color-picker v-else-if="field.type==='color'" v-model="form.definitionJson[group.key][field.key]"/>
              </label>
            </div>
          </details>
        </section><section class="theme-live"><header><strong>网站实时预览</strong><div><button type="button" :class="{active:previewMode==='desktop'}" @click="previewMode='desktop'">桌面</button><button type="button" :class="{active:previewMode==='mobile'}" @click="previewMode='mobile'">手机</button></div></header><div ref="previewWrap" class="theme-frame-wrap" :class="previewMode"><div class="preview-stage" :style="stageStyle"><iframe ref="previewFrame" :style="frameStyle" src="/?theme-preview=1" title="主题实时预览" @load="postPreview"></iframe></div></div></section></div>
        <template #footer><el-button @click="editor=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveTheme">保存主题</el-button></template>
      </el-dialog>
    </div>`
  };

  /** 标签管理：改名、合并、删除，以及清理没有任何日记引用的标签。 */
  const TagManager = {
    setup() {
      const items = ref([]), loading = ref(false), renaming = ref(null), newName = ref('');
      const mergeSource = ref(null), mergeTarget = ref(null);

      async function load() {
        loading.value = true;
        try { items.value = await A.journalTags(); }
        catch (e) { fail(e); }
        finally { loading.value = false; }
      }
      function startRename(item) { renaming.value = item.id; newName.value = item.name; }
      async function commitRename() {
        const name = newName.value.trim();
        if (!name) return;
        try {
          await A.renameTag(renaming.value, name);
          renaming.value = null;
          message('标签已更新');
          load();
        } catch (e) { fail(e); }
      }
      async function doMerge() {
        if (!mergeSource.value || !mergeTarget.value) return ElementPlus.ElMessage.warning('请选择要合并的两个标签');
        if (mergeSource.value === mergeTarget.value) return ElementPlus.ElMessage.warning('不能合并到自己');
        const source = items.value.find(x => x.id === mergeSource.value);
        const target = items.value.find(x => x.id === mergeTarget.value);
        try {
          await confirm('把「' + source.name + '」并入「' + target.name + '」？前者会被删除，它的日记全部转到后者。');
          await A.mergeTag(mergeSource.value, mergeTarget.value);
          mergeSource.value = mergeTarget.value = null;
          message('已合并');
          load();
        } catch (e) { if (e !== 'cancel' && e !== 'close') fail(e); }
      }
      async function remove(item) {
        try {
          await confirm(item.journalCount > 0
            ? '「' + item.name + '」还被 ' + item.journalCount + ' 篇日记使用，删除后这些日记会失去该标签。确定删除？'
            : '确定删除标签「' + item.name + '」吗？');
          await A.deleteTag(item.id);
          message('标签已删除');
          load();
        } catch (e) { if (e !== 'cancel' && e !== 'close') fail(e); }
      }
      async function purge() {
        try {
          await confirm('清理所有没有日记引用的标签？');
          const count = await A.purgeUnusedTags();
          message(count ? '已清理 ' + count + ' 个空标签' : '没有需要清理的标签');
          load();
        } catch (e) { if (e !== 'cancel' && e !== 'close') fail(e); }
      }
      onMounted(load);
      return { items, loading, renaming, newName, mergeSource, mergeTarget,
               startRename, commitRename, doMerge, remove, purge };
    },
    template: `<div><div class="page-head"><div><h2>标签管理</h2><p>标签在写日记时自动创建，这里可以改名、合并同义标签或清理不再使用的。</p></div><el-button @click="purge">清理无引用标签</el-button></div>
      <div class="panel panel-pad tag-merge-bar">
        <span>合并标签</span>
        <el-select v-model="mergeSource" clearable placeholder="把这个标签" filterable><el-option v-for="x in items" :key="x.id" :label="x.name+'（'+x.journalCount+'）'" :value="x.id"/></el-select>
        <span>并入</span>
        <el-select v-model="mergeTarget" clearable placeholder="这个标签" filterable><el-option v-for="x in items" :key="x.id" :label="x.name+'（'+x.journalCount+'）'" :value="x.id"/></el-select>
        <el-button type="primary" @click="doMerge">合并</el-button>
      </div>
      <div class="panel" style="margin-top:18px"><el-table v-loading="loading" :data="items" max-height="calc(100vh - 340px)">
        <el-table-column label="标签" min-width="220"><template #default="{row}">
          <template v-if="renaming===row.id"><el-input v-model="newName" size="small" style="max-width:220px" @keyup.enter="commitRename"/><el-button link type="primary" size="small" @click="commitRename">保存</el-button><el-button link size="small" @click="renaming=null">取消</el-button></template>
          <span v-else>{{row.name}}</span>
        </template></el-table-column>
        <el-table-column prop="slug" label="标识" min-width="180"/>
        <el-table-column prop="journalCount" label="日记数" width="100"/>
        <el-table-column label="操作" width="160"><template #default="{row}">
          <div class="table-actions">
            <el-button v-if="renaming!==row.id" size="small" @click="startRename(row)">改名</el-button>
            <el-button size="small" type="danger" plain @click="remove(row)">删除</el-button>
          </div>
        </template></el-table-column>
      </el-table></div>
      <el-empty v-if="!items.length&&!loading" description="还没有标签，写日记时输入标签名即可创建"/>
    </div>`
  };

  const routes=[
    {path:'/login',component:Login,meta:{public:true,title:'登录'}},
    {path:'/',component:Dashboard,meta:{title:'管理首页'}},
    {path:'/trips',component:Trips,meta:{title:'旅行管理'}},
    {path:'/trips/:id',component:TripWorkspace,meta:{title:'旅行工作台'}},
    {path:'/journals/:id',component:JournalEditor,meta:{title:'编辑旅行日记',full:true}},
    {path:'/templates',component:TemplateManager,meta:{title:'日记模板'}},
    {path:'/tags',component:TagManager,meta:{title:'标签管理'}},
    {path:'/themes',component:Theme,meta:{title:'主题外观'}},
    {path:'/profile',component:Profile,meta:{title:'个人资料'}}
  ];
  const router=VueRouter.createRouter({history:VueRouter.createWebHashHistory(),routes});
  router.beforeEach(async to=>{if(to.meta.public)return true;const user=await loadSession();return user?true:'/login';});

  const App = {
    setup() {
      const drawer=ref(false); const route=VueRouter.useRoute();
      const full=computed(()=>route.meta.full);
      // 桌面端侧边栏折叠成图标条，记住选择；手机端走的是 drawer，不受这个影响
      const collapsed=ref(localStorage.getItem('travel-journal.sidebar')==='collapsed');
      watch(collapsed,value=>{
        localStorage.setItem('travel-journal.sidebar',value?'collapsed':'expanded');
        document.body.classList.toggle('sidebar-collapsed',value);
      },{immediate:true});
      watch(()=>route.fullPath,()=>drawer.value=false);
      async function logout(){try{await api.auth.logout();session.user=null;session.checked=true;router.replace('/login');}catch(e){fail(e);}}
      return{session,drawer,route,full,collapsed,logout};
    },
    template: `<router-view v-if="route.meta.public"></router-view><div v-else class="admin-shell">
      <div class="sidebar-backdrop" :class="{open:drawer}" @click="drawer=false"></div>
      <aside class="admin-sidebar" :class="{open:drawer,collapsed}"><button class="sidebar-close" type="button" aria-label="收起侧边栏" @click="drawer=false">×</button>
        <div class="sidebar-brand">远行手记<small>TRAVEL JOURNAL</small></div>
        <button class="sidebar-collapse" type="button" :aria-pressed="collapsed" :title="collapsed?'展开侧边栏':'折叠侧边栏'" :aria-label="collapsed?'展开侧边栏':'折叠侧边栏'" @click="collapsed=!collapsed">{{collapsed?'»':'«'}}</button>
        <nav class="side-nav"><router-link to="/" title="管理首页" @click="drawer=false"><i aria-hidden="true">⌂</i><span>管理首页</span></router-link><router-link to="/trips" title="旅行管理" @click="drawer=false"><i aria-hidden="true">▣</i><span>旅行管理</span></router-link><router-link to="/templates" title="日记模板" @click="drawer=false"><i aria-hidden="true">▤</i><span>日记模板</span></router-link><router-link to="/tags" title="标签管理" @click="drawer=false"><i aria-hidden="true">◇</i><span>标签管理</span></router-link><router-link to="/themes" title="主题外观" @click="drawer=false"><i aria-hidden="true">◈</i><span>主题外观</span></router-link><router-link to="/profile" title="个人资料" @click="drawer=false"><i aria-hidden="true">◎</i><span>个人资料</span></router-link><a href="/" target="_blank" title="查看网站" @click="drawer=false"><i aria-hidden="true">↗</i><span>查看网站</span></a></nav>
        <div class="sidebar-user" :title="session.user?.displayName"><div class="sidebar-avatar"><img v-if="session.user?.avatarUrl" :src="session.user.avatarUrl" alt="头像"><span v-else>{{session.user?.displayName?.slice(0,1) || '旅'}}</span></div><div><div>{{session.user?.displayName}}</div><small>{{session.user?.username}}</small></div></div></aside>
      <main class="admin-main"><template v-if="!full"><header class="admin-topbar"><el-button class="mobile-toggle" @click="drawer=!drawer">☰</el-button><h1>{{route.meta.title}}</h1><div class="top-actions"><el-button link @click="logout">退出登录</el-button></div></header><div class="admin-content"><router-view></router-view></div></template><router-view v-else></router-view></main>
    </div>`
  };

  const app = createApp(App);
  /*
   * 触摸设备上日期/时间选择器不允许手输。
   *
   * Element Plus 的日期框默认可以手打，于是手指一点先弹出系统键盘，
   * 键盘又正好把下面的日历面板顶掉——想选个日期得先收键盘。
   * 关掉 editable 后输入框变成只读，点它只弹面板不弹键盘。
   * 桌面端保留手输，敲日期比点日历快。
   *
   * el-select 不用管：非 filterable 时 Element Plus 自己就把输入框设成只读了；
   * filterable 的下拉本来就要打字搜索，弹键盘是对的。
   */
  app.config.globalProperties.$allowTextInput = !window.matchMedia('(pointer: coarse)').matches;
  app.use(router)
    .use(ElementPlus, { locale: window.ElementPlusLocaleZhCn })
    .mount('#admin-app');
})();
