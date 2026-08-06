(function () {
  const { createApp, ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } = Vue;
  const api = window.TravelApi;
  const A = api.admin;
  // 正文图片标记的拼装、反解和轮播/对比的行为，和公开端共用一份
  const JM = window.JournalMedia;
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

  /*
   * 模板预览用的示例数据和渲染器。
   *
   * 真正的生成在后端 JournalTemplateService.appendBlock，需要一次真实旅行；
   * 而模板是在还没有旅行数据的时候设计的，所以预览只能用示例数据——这不是妥协，
   * 「这个区块最后长什么样」本来就该用样例回答。
   * 输出规则（标题前缀、空内容跳过、各区块的 Markdown 形态）与后端逐条对齐，
   * 改后端 appendBlock 时记得同步这里。
   */
  const SAMPLE_PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">' +
    '<rect width="1200" height="800" fill="#d8cbb4"/>' +
    '<text x="600" y="430" font-size="64" fill="#6b6152" text-anchor="middle" font-family="sans-serif">示例照片</text></svg>');
  const SAMPLE = {
    occurredOn: '2026-03-14',
    city: '成都市',
    tripTitle: '青城山一日游',
    currency: 'CNY',
    weather: '小雨',
    mood: '松弛',
    stops: ['成都市', '都江堰市', '青城山'],
    itinerary: [
      { time: '09:20', title: '成都东站出发', address: '成都东站' },
      { time: '11:40', title: '青城山索道', address: '' },
      { time: '14:05', title: '老君阁', address: '青城山景区' }
    ],
    expenses: [['交通', 168], ['门票', 90], ['餐饮', 76]]
  };

  function sampleBlockContent(block) {
    const config = block.config || {};
    const max = Number(config.max) || 5;
    switch (block.type) {
      case 'trip-info':
        return '> ' + [SAMPLE.occurredOn, SAMPLE.city, SAMPLE.tripTitle, SAMPLE.weather, SAMPLE.mood].join(' · ');
      case 'route':
        return config.source === 'trip' ? SAMPLE.stops.join(' → ')
          : SAMPLE.itinerary.map(x => x.title).join(' → ');
      case 'itinerary':
        return SAMPLE.itinerary.map(x => '- ' + x.time + ' ' + x.title + (x.address ? '（' + x.address + '）' : '')).join('\n');
      case 'expense-summary': {
        const rows = SAMPLE.expenses.map(([name, amount]) => '- ' + name + '：' + SAMPLE.currency + ' ' + amount);
        const total = SAMPLE.expenses.reduce((sum, [, amount]) => sum + amount, 0);
        return rows.join('\n') + '\n\n**合计：' + SAMPLE.currency + ' ' + total + '**';
      }
      case 'quote':
        return '> ' + (config.placeholder || '雾散开的那一刻，整条山脊都露出来了。');
      case 'rating':
        return '★'.repeat(Math.min(4, max)) + '☆'.repeat(Math.max(0, max - 4)) + '（' + Math.min(4, max) + '/' + max + '）';
      case 'checklist':
        return ['- [x] 带好雨具', '- [ ] 买返程票', '- [ ] 寄明信片'].join('\n');
      case 'image':
      case 'gallery': {
        const size = config.imageSize || 'medium';
        const align = config.align || 'center';
        const layout = config.layout;
        const count = block.type === 'gallery' ? (layout === 'compare' ? 2 : 3) : 1;
        const items = Array.from({ length: count }, () => ({ displayUrl: SAMPLE_PHOTO, alt: '示例照片' }));
        return window.JournalMedia.buildFigure({
          mode: block.type === 'gallery' && layout && layout !== 'stack' ? layout : 'single',
          items, size, align, cols: 3, caption: ''
        });
      }
      case 'divider':
        return '---';
      case 'text':
        return config.placeholder || '一句话记录';
      case 'textarea':
        return config.placeholder || '我们只用半天时间就爬完青城山了，本来以为爬不到山顶。';
      default:
        return '';
    }
  }

  /** 把模板区块渲染成一篇示例日记的 Markdown。 */
  function renderTemplateSample(blocks) {
    return (blocks || []).map(block => {
      const content = sampleBlockContent(block);
      if (!content) return '';
      const heading = block.title && block.type !== 'divider' ? '## ' + block.title + '\n\n' : '';
      return heading + content.trim();
    }).filter(Boolean).join('\n\n');
  }

  // 生成一条必填规则。下拉框和日期选择器要用 change 触发，输入框用 blur。
  const required = (message, trigger='blur') => ({ required:true, message, trigger });
  // 把任意校验函数包成 Element Plus 认识的 validator 规则，返回 true 表示通过
  const check = (fn, message, trigger='blur') => ({
    validator: (rule, value, callback) => fn(value) ? callback() : callback(new Error(message)), trigger
  });
  const slugRule = { pattern:/^[a-z0-9]+(?:-[a-z0-9]+)*$/, message:'只能使用小写字母、数字和短横线', trigger:'blur' };

  // 提交前统一走一次表单校验，未通过时给一句总的提示，具体错误由各字段自己显示
  async function validateForm(formRef) {
    if (!formRef.value) return true;
    try { await formRef.value.validate(); return true; }
    catch (_) { ElementPlus.ElMessage.warning('请先补全标记为必填的内容'); return false; }
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
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="开始日期" prop="startDate"><el-date-picker v-model="form.startDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择开始日期"/></el-form-item><el-form-item label="结束日期" prop="endDate"><el-date-picker v-model="form.endDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择结束日期"/></el-form-item></div>
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

      // ------------------------------------------------------------------ 移动端 tab 手势
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
      // 切 tab 时补齐这个 tab 需要、且已经过期的数据块
      watch(active,tab=>{ensure(tabBlocks[tab]||[]);centerActiveTab();});
      onMounted(()=>{ensure(['trip',...tabBlocks[active.value]]);centerActiveTab();});

      return {data,stale,isLoading,ready,active,
              stopDialog,itemDialog,expenseDialog,editingStop,editingItem,editingExpense,
              stopFormRef,itemFormRef,expenseFormRef,savingStop,savingItem,savingExpense,
              stopForm,itemForm,expenseForm,stopRules,itemRules,expenseRules,
              mapStatus,locationKeyword,locationResults,locationLoading,stopMapEl,
              openStop,closeStop,searchLocations,applyLocation,saveStop,
              openItem,saveItem,toggleCompleted,openExpense,saveExpense,saveCategory,
              remove,removeJournal,beginTabSwipe,endTabSwipe,router,
              itineraryTypeOptions,statusLabel,itineraryTypeLabel,timeRange};
    },
    template: `<div v-if="ready"><div class="workspace-head"><span class="back" @click="router.push('/trips')">← 返回</span><div><h2>{{data.trip.title}}</h2><div class="workspace-meta">{{data.trip.startDate}} — {{data.trip.endDate}} · {{statusLabel(data.trip.status)}}</div></div></div>
      <el-tabs v-model="active" class="workspace-tabs" @touchstart.passive="beginTabSwipe" @touchend.passive="endTabSwipe">
        <el-tab-pane label="概览" name="overview"><div v-loading="isLoading('trip','dashboard')" class="tab-loading-host"><div class="dashboard-grid"><div class="metric"><span>城市</span><strong>{{data.dashboard?.stopCount ?? '—'}}</strong></div><div class="metric"><span>行程</span><strong>{{data.dashboard?.itineraryCount ?? '—'}}</strong></div><div class="metric"><span>草稿</span><strong>{{data.dashboard?.draftCount ?? '—'}}</strong></div><div class="metric"><span>已发布</span><strong>{{data.dashboard?.publishedCount ?? '—'}}</strong></div></div><p>{{data.trip.summary||'还没有旅行简介。'}}</p></div></el-tab-pane>
        <el-tab-pane label="城市" name="stops"><div class="tab-actions"><el-button type="primary" @click="openStop()">添加城市</el-button></div><el-table v-loading="isLoading('stops')" :data="data.stops" max-height="calc(100vh - 360px)"><el-table-column prop="cityName" label="城市"/><el-table-column prop="countryName" label="国家"/><el-table-column prop="arrivalDate" label="到达"/><el-table-column prop="departureDate" label="离开"/><el-table-column label="操作" width="140"><template #default="{row}"><el-button link @click="openStop(row)">编辑</el-button><el-button link type="danger" @click="remove('stop',row)">删除</el-button></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="行程" name="itinerary"><div class="tab-actions"><el-button type="primary" @click="openItem()">添加行程</el-button></div><el-table v-loading="isLoading('itinerary')" :data="data.itinerary" max-height="calc(100vh - 360px)"><el-table-column prop="itemDate" label="日期" width="120"/><el-table-column label="时间" width="140"><template #default="{row}">{{timeRange(row.startTime,row.endTime)}}</template></el-table-column><el-table-column label="类型" width="110"><template #default="{row}">{{itineraryTypeLabel(row.type)}}</template></el-table-column><el-table-column prop="title" label="行程"/><el-table-column label="完成" width="80"><template #default="{row}"><el-checkbox v-model="row.completed" @change="toggleCompleted(row)"/></template></el-table-column><el-table-column label="操作" width="140"><template #default="{row}"><el-button link @click="openItem(row)">编辑</el-button><el-button link type="danger" @click="remove('item',row)">删除</el-button></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="预算" name="budget"><div v-loading="isLoading('budget')" class="tab-loading-host"><div class="budget-summary"><div class="item"><span>总预算</span><strong>{{data.budget?.currency}} {{data.budget?.plannedTotal ?? '—'}}</strong></div><div class="item"><span>已支出</span><strong>{{data.budget?.currency}} {{data.budget?.actualTotal ?? '—'}}</strong></div><div class="item"><span>剩余</span><strong :class="{over:data.budget?.remaining<0}">{{data.budget?.currency}} {{data.budget?.remaining ?? '—'}}</strong></div></div><el-table :data="data.budget?.categories||[]" max-height="calc(100vh - 430px)"><el-table-column prop="name" label="分类"/><el-table-column label="计划金额" min-width="180"><template #default="{row}"><el-input-number class="budget-amount-input" v-model="row.planned" :min="0" :precision="2"/></template></el-table-column><el-table-column prop="actual" label="实际支出"/><el-table-column prop="remaining" label="剩余"/><el-table-column width="90"><template #default="{row}"><el-button link @click="saveCategory(row)">保存</el-button></template></el-table-column></el-table></div></el-tab-pane>
        <el-tab-pane label="支出" name="expenses"><div class="tab-actions"><el-button type="primary" @click="openExpense()">记录支出</el-button></div><el-table v-loading="isLoading('expenses')" :data="data.expenses" max-height="calc(100vh - 360px)"><el-table-column prop="expenseDate" label="日期"/><el-table-column prop="description" label="说明"/><el-table-column prop="merchant" label="商户"/><el-table-column prop="amount" label="金额"/><el-table-column label="操作" width="140"><template #default="{row}"><el-button link @click="openExpense(row)">编辑</el-button><el-button link type="danger" @click="remove('expense',row)">删除</el-button></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="日记" name="journals"><div class="tab-actions"><el-button type="primary" @click="router.push('/journals/new?tripId='+data.trip.id+'&from=journals')">新建日记</el-button></div><el-table v-loading="isLoading('journals')" :data="data.journals" max-height="calc(100vh - 360px)"><el-table-column prop="title" label="标题"/><el-table-column prop="occurredOn" label="日期"/><el-table-column label="状态"><template #default="{row}">{{statusLabel(row.status)}}</template></el-table-column><el-table-column label="操作" width="150"><template #default="{row}"><el-button link @click="router.push('/journals/'+row.id+'?from=journals')">编辑</el-button><el-button link type="danger" @click="removeJournal(row)">删除</el-button></template></el-table-column></el-table></el-tab-pane>
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
          <div class="form-grid form-grid-2"><el-form-item label="到达日期"><el-date-picker v-model="stopForm.arrivalDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择到达日期"/></el-form-item><el-form-item label="离开日期" prop="departureDate"><el-date-picker v-model="stopForm.departureDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择离开日期"/></el-form-item></div>
          <details class="advanced-location"><summary>高级地点信息</summary><div class="form-grid form-grid-2"><el-form-item label="国家" prop="countryName"><el-input v-model="stopForm.countryName"/></el-form-item><el-form-item label="国家代码"><el-input v-model="stopForm.countryCode" maxlength="2"/></el-form-item></div><div class="form-grid form-grid-2"><el-form-item label="纬度"><el-input-number v-model="stopForm.latitude" :precision="6" :controls="false"/></el-form-item><el-form-item label="经度"><el-input-number v-model="stopForm.longitude" :precision="6" :controls="false"/></el-form-item></div><div class="form-grid form-grid-2"><el-form-item label="行政区代码"><el-input v-model="stopForm.adcode"/></el-form-item><el-form-item label="坐标系"><el-select v-model="stopForm.coordinateSystem"><el-option label="高德 GCJ-02" value="GCJ02"/><el-option label="WGS84" value="WGS84"/></el-select></el-form-item></div></details>
          <el-form-item label="备注"><el-input v-model="stopForm.note" type="textarea" :rows="2"/></el-form-item>
        </el-form>
        <template #footer><el-button @click="stopDialog=false">取消</el-button><el-button type="primary" :loading="savingStop" @click="saveStop">保存地点</el-button></template>
      </el-dialog>

      <el-dialog v-model="itemDialog" :title="editingItem?'编辑行程':'添加行程'" width="min(650px,92vw)" destroy-on-close @closed="editingItem=null">
        <el-form ref="itemFormRef" :model="itemForm" :rules="itemRules" label-position="top">
          <el-form-item label="标题" prop="title"><el-input v-model="itemForm.title" placeholder="例如：清水寺"/></el-form-item>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="日期" prop="itemDate"><el-date-picker v-model="itemForm.itemDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择日期"/></el-form-item><el-form-item label="类型" prop="type"><el-select v-model="itemForm.type"><el-option v-for="x in itineraryTypeOptions" :key="x.value" :label="x.label" :value="x.value"/></el-select></el-form-item></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="开始"><el-time-picker v-model="itemForm.startTime" format="HH时mm分" value-format="HH:mm:ss" placeholder="开始时间"/></el-form-item><el-form-item label="结束" prop="endTime"><el-time-picker v-model="itemForm.endTime" format="HH时mm分" value-format="HH:mm:ss" placeholder="结束时间"/></el-form-item></div>
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
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="日期" prop="expenseDate"><el-date-picker v-model="expenseForm.expenseDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择日期"/></el-form-item><el-form-item label="金额" prop="amount"><el-input-number v-model="expenseForm.amount" :min="0.01" :precision="2"/></el-form-item></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="分类" prop="budgetCategoryId"><el-select v-model="expenseForm.budgetCategoryId" placeholder="选择预算分类"><el-option v-for="x in (data.budget?data.budget.categories:[])" :key="x.id" :label="x.name" :value="x.id"/></el-select></el-form-item><el-form-item label="所属城市"><el-select v-model="expenseForm.tripStopId" clearable placeholder="不指定"><el-option v-for="x in data.stops" :key="x.id" :label="x.cityName" :value="x.id"/></el-select></el-form-item></div>
          <el-form-item label="商户"><el-input v-model="expenseForm.merchant"/></el-form-item>
          <el-form-item label="备注"><el-input v-model="expenseForm.note" type="textarea"/></el-form-item>
        </el-form>
        <template #footer><el-button @click="expenseDialog=false">取消</el-button><el-button type="primary" :loading="savingExpense" @click="saveExpense">保存</el-button></template>
      </el-dialog>
    </div><div v-else style="padding:80px;text-align:center">正在打开旅行工作台…</div>`
  };
  const JournalEditor = {
    setup() {
      const route=VueRouter.useRoute(),router=VueRouter.useRouter(), id=ref(route.params.id==='new'?null:Number(route.params.id));
      const trips=ref([]),stops=ref([]),media=ref([]),templates=ref([]),themes=ref([]),uploading=ref(false),saving=ref(false),dirty=ref(false),fileInput=ref(null),textarea=ref(null);
      const templateDialog=ref(false),selectedTemplate=ref(null),templateData=ref({}),generating=ref(false),imageDialog=ref(false),mobilePane=ref('write'),mobileMetaCollapsed=ref(false);
      const previewEl=ref(null),selectedMedia=ref([]),dragFrom=ref(null),dragOver=ref(null);
      // 版式面板的全部状态。默认值刻意留空字符串＝「跟随主题」，拼 class 时不输出。
      // editRange 非空表示这次是在改正文里已有的一段图片，而不是插入新的。
      const imageForm=reactive({items:[],mode:'single',size:'medium',align:'center',wrap:false,
        ratio:'',focus:'',frame:'',radius:'',caption:'',captionPos:'',cols:3,editRange:null});
      const formRef=ref(null);
      const form=reactive({tripId:route.query.tripId?Number(route.query.tripId):null,tripStopId:null,title:'',slug:'',excerpt:'',contentMarkdown:'',occurredOn:'',coverMediaId:null,status:'DRAFT',themeKey:null,templateId:null,templateVersion:null,templateData:null,templateSnapshot:null,templateDetached:false});
      // 保存草稿时就校验，不用等到点「发布」才发现少填了东西
      const rules={
        title:[required('请填写日记标题')],
        tripId:[required('请选择所属旅行','change')],
        slug:[required('请填写 Slug'),slugRule],
        occurredOn:[required('请选择发生日期','change')]
      };
      const html=computed(()=>DOMPurify.sanitize(marked.parse(form.contentMarkdown||'',{breaks:true})));
      const wordCount=computed(()=>String(form.contentMarkdown||'').replace(/<[^>]+>|[#>*_`\[\]()-]/g,'').replace(/\s/g,'').length);
      const templateBlocks=computed(()=>selectedTemplate.value?.definitionJson?.blocks||[]);
      async function load(){try{[trips.value,templates.value,themes.value]=await Promise.all([(await A.trips({page:1,pageSize:100})).items,A.templates(true),A.themes(true)]);if(id.value){Object.assign(form,await A.journal(id.value));media.value=await A.media(id.value);}if(form.tripId)stops.value=await A.stops(form.tripId);if(form.templateId){selectedTemplate.value=templates.value.find(x=>x.id===form.templateId)||{id:form.templateId,name:'日记所用模板',definitionJson:form.templateSnapshot};templateData.value=form.templateData||{};}dirty.value=false;}catch(e){fail(e);}}
      watch(()=>form.tripId,async value=>{if(value)stops.value=await A.stops(value);});
      watch(form,()=>dirty.value=true,{deep:true});
      async function save(silent=false){if(!await validateForm(formRef))return false;saving.value=true;try{const body={tripId:form.tripId,tripStopId:form.tripStopId,title:form.title,slug:form.slug,excerpt:form.excerpt,contentMarkdown:form.contentMarkdown,occurredOn:form.occurredOn,coverMediaId:form.coverMediaId,themeKey:form.themeKey,templateId:form.templateId,templateVersion:form.templateVersion,templateData:form.templateData,templateSnapshot:form.templateSnapshot,templateDetached:form.templateDetached};if(id.value)await A.updateJournal(id.value,body);else{const created=await A.createJournal(body);id.value=created.id;form.status=created.status;
          // 换成正式 id 时要把 from 带上，否则保存后返回又会掉回概览
          router.replace({path:'/journals/'+created.id,query:route.query.from?{from:route.query.from}:{}});}dirty.value=false;if(!silent)message('草稿已保存');return true;}catch(e){fail(e);return false;}finally{saving.value=false;}}
      async function publish(){try{if(!await save(true))return;await A.publishJournal(id.value);form.status='PUBLISHED';message('日记已发布');}catch(e){fail(e);}}
      async function unpublish(){try{await A.unpublishJournal(id.value);form.status='DRAFT';message('日记已撤回');}catch(e){fail(e);}}
      /*
       * 上传前必须已经有日记 id。图片是挂在 journal_media 上的，没有归属的日记
       * 就没有任何入口能再找到它、更没法删除，只会一直占着对象存储——所以这里
       * 宁可拦下来让用户先存一次草稿，也不允许先传后建。
       */
      async function requireDraft(){
        if(id.value)return true;
        try{
          await confirm('图片要挂在日记下面，需要先保存一次草稿。现在保存吗？');
          return await save(true);
        }catch(e){return false;}
      }
      /** 多张时逐个串行上传：后端有单篇张数上限，串行才能在超限时准确停在那一张。 */
      async function upload(files){
        const list=Array.from(files||[]).filter(x=>x&&x.type&&x.type.startsWith('image/'));
        if(!list.length)return;
        if(!await requireDraft())return;
        uploading.value=true;
        const added=[];
        try{
          for(const file of list){
            const fd=new FormData();fd.append('file',file);
            const item=await A.uploadMedia(id.value,fd);
            media.value.push(item);added.push(item);
          }
        }catch(e){fail(e);}
        finally{uploading.value=false;}
        if(!added.length)return;
        message(added.length>1?('已上传 '+added.length+' 张，可以设置版式后插入'):'图片已上传，可以设置版式后插入');
        // 一次传多张时默认按图组打开版式面板，省得一张张插
        openImageDialog(added);
      }
      function choose(){fileInput.value.click();}
      function picked(event){upload(event.target.files);event.target.value='';}
      function onPaste(event){const files=Array.from(event.clipboardData?.files||[]).filter(x=>x.type.startsWith('image/'));if(files.length){event.preventDefault();upload(files);}}
      function dropped(event){upload(event.dataTransfer?.files);}
      // 版式面板：预览台和最终写进正文的字符串走同一个 buildFigure，真正所见即所得
      const figureMarkup=computed(()=>JM.buildFigure(imageForm));
      const figurePreview=computed(()=>figureMarkup.value?DOMPurify.sanitize(marked.parse(figureMarkup.value)):'');
      const isGallery=computed(()=>imageForm.items.length>1);
      const galleryModes=[{value:'row',label:'并排'},{value:'grid',label:'网格'},{value:'masonry',label:'瀑布流'},{value:'mosaic',label:'拼贴'},{value:'carousel',label:'轮播'},{value:'filmstrip',label:'胶片条'},{value:'compare',label:'前后对比'}];
      function resetImageForm(){Object.assign(imageForm,{items:[],mode:'single',size:'medium',align:'center',wrap:false,ratio:'',focus:'',frame:'',radius:'',caption:'',captionPos:'',cols:3,editRange:null});}
      /** 打开版式面板。传入的图片来自媒体侧栏，多选时默认用并排。 */
      function openImageDialog(items){
        if(!items.length)return;
        resetImageForm();
        imageForm.items=items.map(item=>({displayUrl:item.displayUrl,alt:item.caption||''}));
        imageForm.mode=items.length>1?'row':'single';
        // 竖图默认小一点，免得一张照片吃掉整屏
        imageForm.size=items.length===1&&items[0].height>items[0].width?'small':'medium';
        imageForm.caption=items.length===1?(items[0].caption||''):'';
        imageDialog.value=true;
      }
      function insertImage(item){openImageDialog([item]);}
      function insertSelected(){openImageDialog(media.value.filter(x=>selectedMedia.value.includes(x.id)));}
      function confirmImage(){
        const markup=figureMarkup.value;
        if(!markup)return;
        if(imageForm.editRange){
          const {start,end}=imageForm.editRange;
          form.contentMarkdown=form.contentMarkdown.slice(0,start)+markup+form.contentMarkdown.slice(end);
        }else{
          insertAtCursor('\n'+markup+'\n');
        }
        imageDialog.value=false;selectedMedia.value=[];mobilePane.value='write';
      }
      /** 从正文里删掉正在编辑的这段图片；媒体本身留在图片库里。 */
      function removeFigure(){
        if(!imageForm.editRange)return;
        const {start,end}=imageForm.editRange;
        form.contentMarkdown=form.contentMarkdown.slice(0,start)+form.contentMarkdown.slice(end);
        imageDialog.value=false;
      }
      /**
       * 点实时预览里的图片就能改它的版式。预览里的块和正文里的 figure 段落
       * 顺序一一对应，所以按序号定位就够，不用往正文里塞标记。
       */
      function editFigureAt(event){
        // 轮播箭头、圆点和对比手柄是预览里的交互控件，点它们不该弹版式面板
        if(event.target.closest?.('.journal-carousel__nav, .journal-carousel__dots, .journal-compare__handle'))return;
        const block=event.target.closest?.('.journal-figure, .journal-gallery');
        if(!block||!previewEl.value)return;
        const blocks=Array.from(previewEl.value.querySelectorAll('.journal-figure, .journal-gallery'));
        const index=blocks.indexOf(block);
        const ranges=JM.figureRanges(form.contentMarkdown);
        if(index<0||!ranges[index])return;
        const parsed=JM.parseFigure(ranges[index].markup);
        if(!parsed){ElementPlus.ElMessage.warning('这段图片是手工编辑过的，请直接在左侧正文里修改');return;}
        resetImageForm();
        Object.assign(imageForm,parsed);
        imageForm.editRange={start:ranges[index].start,end:ranges[index].end};
        imageDialog.value=true;
      }
      function insertAtCursor(syntax){const el=textarea.value?.$el?.querySelector('textarea');if(!el){form.contentMarkdown+=syntax;return;}const start=el.selectionStart??form.contentMarkdown.length,end=el.selectionEnd??start;form.contentMarkdown=form.contentMarkdown.slice(0,start)+syntax+form.contentMarkdown.slice(end);nextTick(()=>{el.focus();el.selectionStart=el.selectionEnd=start+syntax.length;});}
      function insertFormat(before,after,placeholder){const el=textarea.value?.$el?.querySelector('textarea');const start=el?.selectionStart??form.contentMarkdown.length,end=el?.selectionEnd??start,selected=form.contentMarkdown.slice(start,end)||placeholder;insertAtCursor(before+selected+(after||''));}
      /** 逐行加前缀，用于列表和引用：选中多行时每行都套上，而不是只在开头插一个。 */
      function insertLinePrefix(prefix,placeholder,ordered){
        const el=textarea.value?.$el?.querySelector('textarea');
        const start=el?.selectionStart??form.contentMarkdown.length,end=el?.selectionEnd??start;
        const selected=form.contentMarkdown.slice(start,end)||placeholder;
        const body=selected.split('\n').map((line,index)=>(ordered?(index+1)+'. ':prefix)+line).join('\n');
        insertAtCursor('\n'+body+'\n');
      }
      const toolbarGroups=[
        [{label:'H2',title:'二级标题',run:()=>insertFormat('\n## ','\n','小标题')},
         {label:'H3',title:'三级标题',run:()=>insertFormat('\n### ','\n','小节标题')}],
        [{label:'粗体',title:'粗体',run:()=>insertFormat('**','**','重点文字')},
         {label:'斜体',title:'斜体',run:()=>insertFormat('*','*','强调文字')},
         {label:'删除线',title:'删除线',run:()=>insertFormat('~~','~~','划掉的话')},
         {label:'高亮',title:'行内代码',run:()=>insertFormat('`','`','关键词')}],
        [{label:'无序',title:'无序列表',run:()=>insertLinePrefix('- ','清单内容')},
         {label:'有序',title:'有序列表',run:()=>insertLinePrefix('','第一步',true)},
         {label:'待办',title:'待办清单',run:()=>insertLinePrefix('- [ ] ','要做的事')},
         {label:'引用',title:'引用',run:()=>insertLinePrefix('> ','此刻想说的话')}],
        [{label:'链接',title:'链接',run:()=>insertFormat('[','](https://)','链接文字')},
         {label:'代码块',title:'代码块',run:()=>insertFormat('\n```\n','\n```\n','粘贴代码')},
         {label:'表格',title:'插入表格',run:()=>insertAtCursor('\n| 时间 | 地点 | 花费 |\n| --- | --- | --- |\n|  |  |  |\n')},
         {label:'分隔线',title:'分隔线',run:()=>insertAtCursor('\n---\n')}]
      ];
      async function setCover(item){try{await A.setCover(id.value,item.id);form.coverMediaId=item.id;message('已设为封面');}catch(e){fail(e);}}
      function toggleSelect(item){
        const index=selectedMedia.value.indexOf(item.id);
        if(index<0)selectedMedia.value=[...selectedMedia.value,item.id];
        else selectedMedia.value=selectedMedia.value.filter(x=>x!==item.id);
      }
      const allSelected=computed(()=>media.value.length>0&&selectedMedia.value.length===media.value.length);
      function toggleSelectAll(){selectedMedia.value=allSelected.value?[]:media.value.map(x=>x.id);}
      /** 图注存进 journal_media，正文之外的图片库和公开端灯箱才能用上同一份文字。 */
      async function saveCaption(item){
        try{await A.updateMediaCaption(item.relationId,item.caption||'');}catch(e){fail(e);}
      }
      function onDragStart(index){dragFrom.value=index;}
      function onDragOver(index){if(dragFrom.value!==null&&dragFrom.value!==index)dragOver.value=index;}
      function onDragEnd(){dragFrom.value=null;dragOver.value=null;}
      // 后端要求排序列表包含该日记的全部图片，所以整表重排后一次性提交；失败就回滚
      async function onDrop(index){
        const from=dragFrom.value;onDragEnd();
        if(from===null||from===index)return;
        const before=media.value.slice();
        const next=before.slice();
        next.splice(index,0,next.splice(from,1)[0]);
        media.value=next;
        try{await A.reorderMedia(id.value,next.map(x=>x.relationId));}
        catch(e){media.value=before;fail(e);}
      }
      // 封面图片现在也能删，删掉后封面引用由后端清空，这里同步清掉本地状态
      async function removeMedia(item){
        const isCover=form.coverMediaId===item.id;
        try{
          await confirm(isCover?'这张图片是当前日记封面，删除后封面会被清空。确定删除吗？':'确定删除这张图片吗？');
          await A.deleteMedia(item.relationId);
          media.value=media.value.filter(x=>x.relationId!==item.relationId);
          selectedMedia.value=selectedMedia.value.filter(x=>x!==item.id);
          if(isCover)form.coverMediaId=null;
          message('图片已删除');
        }catch(e){if(e!=='cancel'&&e!=='close')fail(e);}
      }
      function defaultBlockData(block){if(block.type==='trip-info')return{weather:'',mood:''};if(block.type==='image')return{mediaIds:null};if(block.type==='gallery')return{mediaIds:[]};if(block.type==='rating')return{value:0};return{value:''};}
      function selectTemplate(item){selectedTemplate.value=item;const values={};(item.definitionJson?.blocks||[]).forEach(block=>values[block.id]=defaultBlockData(block));templateData.value=values;}
      function openTemplate(){templateDialog.value=true;if(!selectedTemplate.value&&templates.value.length)selectTemplate(templates.value[0]);}
      async function generateFromTemplate(){
        if(!selectedTemplate.value)return ElementPlus.ElMessage.warning('请选择模板');
        if(!form.tripId||!form.occurredOn)return ElementPlus.ElMessage.warning('请先选择旅行和发生日期');
        if(form.contentMarkdown.trim()){try{await confirm('生成模板内容会替换当前正文，是否继续？');}catch(e){return;}}
        generating.value=true;try{const result=await A.generateTemplate(selectedTemplate.value.id,{journalId:id.value,tripId:form.tripId,tripStopId:form.tripStopId,occurredOn:form.occurredOn,data:templateData.value});form.contentMarkdown=result.markdown;form.templateId=result.templateId;form.templateVersion=result.templateVersion;form.templateData=result.data;form.templateSnapshot=result.snapshot;form.templateDetached=false;if(!form.title){const city=stops.value.find(x=>x.id===form.tripStopId)?.cityName;form.title=[city,selectedTemplate.value.name].filter(Boolean).join(' · ');}if(!form.slug)form.slug='journal-'+form.occurredOn.replaceAll('-','')+'-'+Date.now().toString().slice(-5);templateDialog.value=false;mobilePane.value='write';
        // 自动区块查不到数据会整块消失，不说一声用户只会觉得「模板没生效」
        if(result.skippedBlocks?.length){
          ElementPlus.ElMessageBox.alert(
            '这些区块没有生成，因为在这次旅行里查不到对应数据：<br><b>'+result.skippedBlocks.join('、')+'</b>'+
            '<br><br>先去旅行工作台补上当天的行程或支出记录，再重新生成即可；也可以在区块设置里把统计范围改成整趟旅行。',
            '部分区块没有数据',{dangerouslyUseHTMLString:true,confirmButtonText:'知道了'}).catch(()=>{});
        }else message('模板已生成，可以继续润色');
        }catch(e){fail(e);}finally{generating.value=false;}
      }
      function markDetached(){if(form.templateId)form.templateDetached=true;}
      /*
       * 返回到来的那一栏。日记编辑器基本都是从工作台的「日记」tab 进来的，
       * 之前一律 push 到 /trips/{id}，工作台就回到默认的概览了。
       * from 由入口带上来，没有就退回日记 tab——这是最可能的来源。
       */
      function backToTrip(){
        if(!form.tripId)return router.push('/trips');
        const tab=TAB_ORDER.includes(route.query.from)?route.query.from:'journals';
        router.push({path:'/trips/'+form.tripId,query:{tab}});
      }
      function beforeUnload(e){if(dirty.value){e.preventDefault();e.returnValue='';}}
      /*
       * 编辑区和预览区按滚动进度百分比联动。两边内容高度不同（Markdown 源码
       * 比渲染结果矮），所以同步的是「滚到了百分之几」而不是像素。
       * syncing 这个闩是必须的：给 B 设 scrollTop 会触发 B 的 scroll 事件，
       * 不挡住就会两边来回推、抖成一团。
       */
      const scrollLocked=ref(localStorage.getItem('travel-journal.editor-scroll-lock')!=='off');
      let syncing=false;
      watch(scrollLocked,value=>localStorage.setItem('travel-journal.editor-scroll-lock',value?'on':'off'));
      function editorTextarea(){return textarea.value?.$el?.querySelector('textarea')||null;}
      function mirrorScroll(from,to){
        if(!scrollLocked.value||syncing||!from||!to)return;
        const fromRange=from.scrollHeight-from.clientHeight;
        const toRange=to.scrollHeight-to.clientHeight;
        if(fromRange<=0||toRange<=0)return;
        syncing=true;
        to.scrollTop=(from.scrollTop/fromRange)*toRange;
        requestAnimationFrame(()=>{syncing=false;});
      }
      function onEditorScroll(){mirrorScroll(editorTextarea(),previewEl.value);}
      function onPreviewScroll(){mirrorScroll(previewEl.value,editorTextarea());}
      // 预览是 v-html 渲染的，轮播和前后对比的结构只能在每次重渲染之后补上
      watch(html,()=>nextTick(()=>{JM.teardown(previewEl.value);JM.enhance(previewEl.value);}));
      // 版式面板的预览台同理，这样在面板里就能真的滑轮播、拖对比手柄
      watch(figurePreview,()=>nextTick(()=>JM.enhance(document.querySelector('.image-layout-dialog .figure-stage'))));
      onMounted(()=>{
        load();window.addEventListener('beforeunload',beforeUnload);
        // el-input 的 textarea 要等渲染完才拿得到
        nextTick(()=>editorTextarea()?.addEventListener('scroll',onEditorScroll,{passive:true}));
      });
      onBeforeUnmount(()=>{
        JM.teardown(previewEl.value);
        editorTextarea()?.removeEventListener('scroll',onEditorScroll);
        window.removeEventListener('beforeunload',beforeUnload);
      });
      return{form,formRef,rules,trips,stops,media,templates,themes,html,wordCount,id,uploading,saving,fileInput,textarea,previewEl,templateDialog,selectedTemplate,templateData,templateBlocks,generating,imageDialog,imageForm,figurePreview,isGallery,galleryModes,selectedMedia,allSelected,dragFrom,dragOver,mobilePane,mobileMetaCollapsed,toolbarGroups,scrollLocked,onPreviewScroll,save,publish,unpublish,choose,picked,onPaste,dropped,insertImage,insertSelected,confirmImage,removeFigure,editFigureAt,toggleSelect,toggleSelectAll,saveCaption,onDragStart,onDragOver,onDragEnd,onDrop,insertFormat,setCover,removeMedia,selectTemplate,openTemplate,generateFromTemplate,markDetached,backToTrip,statusLabel};
    },
    template: `<div class="editor-page"><div class="editor-top"><el-button link @click="backToTrip">← 返回</el-button><h2>编辑旅行日记</h2><span class="status">{{statusLabel(form.status)}}</span><span class="word-count">{{wordCount}} 字</span><div class="editor-actions"><el-button @click="openTemplate">{{form.templateId?'填写模板':'从模板开始'}}</el-button><el-button :loading="saving" @click="save()">保存草稿</el-button><el-button v-if="form.status==='PUBLISHED'" @click="unpublish">撤回</el-button><el-button type="primary" @click="publish">发布日记</el-button></div></div>
      <button type="button" class="editor-meta-toggle" :aria-expanded="!mobileMetaCollapsed" @click="mobileMetaCollapsed=!mobileMetaCollapsed"><span>{{mobileMetaCollapsed?(form.title||'日记信息'):'收起日记信息'}}</span><span aria-hidden="true">{{mobileMetaCollapsed?'⌄':'⌃'}}</span></button>
      <el-form ref="formRef" :model="form" :rules="rules" class="editor-meta-group editor-meta-form" :class="{collapsed:mobileMetaCollapsed}">
      <div class="editor-meta"><el-form-item prop="title"><el-input v-model="form.title" placeholder="日记标题（必填）"/></el-form-item><el-form-item prop="tripId"><el-select v-model="form.tripId" placeholder="所属旅行（必填）"><el-option v-for="x in trips" :key="x.id" :label="x.title" :value="x.id"/></el-select></el-form-item><el-form-item><el-select v-model="form.tripStopId" clearable placeholder="城市"><el-option v-for="x in stops" :key="x.id" :label="x.cityName" :value="x.id"/></el-select></el-form-item><el-form-item prop="occurredOn"><el-date-picker v-model="form.occurredOn" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="发生日期（必填）"/></el-form-item></div>
      <div class="editor-meta editor-meta-secondary"><el-form-item prop="slug"><el-input v-model="form.slug" placeholder="slug（必填），例如 tokyo-spring"/></el-form-item><el-form-item><el-input v-model="form.excerpt" placeholder="摘要"/></el-form-item><el-form-item><el-select v-model="form.themeKey" clearable placeholder="继承旅行 / 全站主题"><el-option v-for="x in themes" :key="x.themeKey" :label="x.name" :value="x.themeKey"/></el-select></el-form-item></div>
      <div v-if="form.templateId" class="template-state" :class="{detached:form.templateDetached}"><span>{{form.templateDetached?'正文已自由修改，不会自动覆盖':'正文仍与模板填写数据关联'}}</span><button type="button" @click="openTemplate">继续填写模板</button></div></el-form>
      <div class="editor-mobile-tabs"><button type="button" :class="{active:mobilePane==='write'}" @click="mobilePane='write'">写作</button><button type="button" :class="{active:mobilePane==='preview'}" @click="mobilePane='preview'">预览</button><button type="button" :class="{active:mobilePane==='media'}" @click="mobilePane='media'">图片</button></div>
      <div class="editor-grid"><section class="editor-column" :class="{'mobile-active':mobilePane==='write'}"><div class="editor-label">Markdown 编辑 <small>支持粘贴图片</small></div><div class="writing-toolbar"><template v-for="(group,gi) in toolbarGroups" :key="gi"><span v-if="gi" class="toolbar-sep" aria-hidden="true"></span><button v-for="item in group" :key="item.label" type="button" :title="item.title" @click="item.run()">{{item.label}}</button></template></div><el-input ref="textarea" class="markdown-input" v-model="form.contentMarkdown" type="textarea" @input="markDetached" @paste="onPaste"/></section>
        <button type="button" class="scroll-lock" :class="{locked:scrollLocked}" :aria-pressed="scrollLocked" :title="scrollLocked?'已锁定：编辑与预览同步滚动':'已解锁：两侧各自滚动'" :aria-label="scrollLocked?'解锁滚动同步':'锁定滚动同步'" @click="scrollLocked=!scrollLocked">{{scrollLocked?'🔒':'🔓'}}</button>
        <section class="editor-column" :class="{'mobile-active':mobilePane==='preview'}"><div class="editor-label">实时预览 <small>点图片可改版式</small></div><article ref="previewEl" class="preview markdown-body" v-html="html" @click="editFigureAt" @scroll.passive="onPreviewScroll"></article></section>
        <aside class="editor-column" :class="{'mobile-active':mobilePane==='media'}"><div class="editor-label">图片管理</div><div class="media-side"><div class="upload-box" @click="choose" @drop.prevent="dropped" @dragover.prevent><span v-if="!uploading">选择、拖拽或粘贴图片<br><small>可多选，JPEG / PNG / WebP</small></span><span v-else>正在上传…</span></div><input ref="fileInput" hidden type="file" multiple accept="image/jpeg,image/png,image/webp" @change="picked">
          <div v-if="media.length" class="media-order"><el-checkbox :model-value="allSelected" :indeterminate="selectedMedia.length>0&&!allSelected" @change="toggleSelectAll">全选</el-checkbox><span v-if="selectedMedia.length">已选 {{selectedMedia.length}} 张 <el-button link type="primary" size="small" @click="insertSelected">插入{{selectedMedia.length>1?'图组':'正文'}}</el-button></span></div>
          <div v-for="(item,index) in media" :key="item.id" class="media-item"
               :class="{selected:selectedMedia.includes(item.id),dragging:dragFrom===index,'drop-before':dragOver===index&&dragFrom>index,'drop-after':dragOver===index&&dragFrom<index}"
               draggable="true" @dragstart="onDragStart(index)" @dragover.prevent="onDragOver(index)" @drop.prevent="onDrop(index)" @dragend="onDragEnd">
            <el-checkbox :model-value="selectedMedia.includes(item.id)" @change="toggleSelect(item)" :aria-label="'选择 '+item.filename"/>
            <img :src="item.thumbnailUrl" :alt="item.caption||item.filename" :title="item.filename">
            <div><el-input class="media-item__caption" v-model="item.caption" placeholder="图注（留空则不显示）" @change="saveCaption(item)"/>
              <div><el-button link size="small" @click="insertImage(item)">插入</el-button><el-button link size="small" @click="setCover(item)">{{form.coverMediaId===item.id?'当前封面':'设封面'}}</el-button><el-button link type="danger" size="small" @click="removeMedia(item)">删除</el-button></div></div></div>
        </div></aside></div>
      <el-dialog v-model="imageDialog" :title="imageForm.editRange?'修改图片版式':'设置图片版式'" width="min(1000px,96vw)" class="image-layout-dialog">
        <div class="image-layout-body">
          <div class="figure-stage markdown-body" v-html="figurePreview"></div>
          <div class="image-layout-controls"><el-form label-position="top">
            <template v-if="isGallery">
              <div class="image-layout-group-title">展示模式</div>
              <el-form-item><el-radio-group v-model="imageForm.mode"><el-radio-button v-for="m in galleryModes" :key="m.value" :value="m.value">{{m.label}}</el-radio-button></el-radio-group>
                <div v-if="imageForm.mode==='compare'&&imageForm.items.length!==2" class="image-layout-hint">前后对比只支持恰好两张图片，当前选了 {{imageForm.items.length}} 张，会退回竖向排列。</div></el-form-item>
              <el-form-item v-if="['grid','masonry'].includes(imageForm.mode)" label="列数"><el-radio-group v-model="imageForm.cols"><el-radio-button :value="2">2 列</el-radio-button><el-radio-button :value="3">3 列</el-radio-button><el-radio-button :value="4">4 列</el-radio-button></el-radio-group></el-form-item>
            </template>
            <div class="image-layout-group-title">版式</div>
            <el-form-item label="展示大小"><el-radio-group v-model="imageForm.size"><el-radio-button value="small">小</el-radio-button><el-radio-button value="medium">中</el-radio-button><el-radio-button value="large">大</el-radio-button><el-radio-button value="full">满宽</el-radio-button><el-radio-button value="bleed">通栏出血</el-radio-button></el-radio-group></el-form-item>
            <el-form-item label="对齐方式"><el-radio-group v-model="imageForm.align"><el-radio-button value="left">居左</el-radio-button><el-radio-button value="center">居中</el-radio-button><el-radio-button value="right">居右</el-radio-button></el-radio-group></el-form-item>
            <el-form-item><el-checkbox v-model="imageForm.wrap" :disabled="imageForm.align==='center'||['full','bleed'].includes(imageForm.size)">让正文文字环绕图片</el-checkbox>
              <div class="image-layout-hint">需要先设为居左或居右，且不是满宽/通栏。窄屏会自动取消环绕。</div></el-form-item>
            <div class="image-layout-group-title">裁剪</div>
            <el-form-item label="显示比例"><el-radio-group v-model="imageForm.ratio"><el-radio-button value="">原始比例</el-radio-button><el-radio-button value="16x9">16:9</el-radio-button><el-radio-button value="4x3">4:3</el-radio-button><el-radio-button value="1x1">1:1</el-radio-button><el-radio-button value="3x4">3:4</el-radio-button></el-radio-group>
              <div class="image-layout-hint">原始比例下卡片会贴合照片本身；选了比例则按比例裁剪填满。</div></el-form-item>
            <el-form-item v-if="imageForm.ratio" label="裁剪焦点"><el-radio-group v-model="imageForm.focus"><el-radio-button value="">居中</el-radio-button><el-radio-button value="top">偏上</el-radio-button><el-radio-button value="bottom">偏下</el-radio-button></el-radio-group></el-form-item>
            <div class="image-layout-group-title">外观</div>
            <el-form-item label="画框"><el-radio-group v-model="imageForm.frame"><el-radio-button value="">跟随主题</el-radio-button><el-radio-button value="none">无框</el-radio-button><el-radio-button value="line">细描边</el-radio-button><el-radio-button value="paper">相纸白边</el-radio-button><el-radio-button value="float">浮起阴影</el-radio-button><el-radio-button value="polaroid">宝丽来</el-radio-button></el-radio-group></el-form-item>
            <el-form-item label="圆角"><el-radio-group v-model="imageForm.radius"><el-radio-button value="">跟随主题</el-radio-button><el-radio-button value="none">直角</el-radio-button><el-radio-button value="soft">小圆角</el-radio-button><el-radio-button value="round">大圆角</el-radio-button></el-radio-group></el-form-item>
            <div class="image-layout-group-title">图注</div>
            <el-form-item label="图注文字"><el-input v-model="imageForm.caption" placeholder="这张照片背后的故事，留空则不显示"/></el-form-item>
            <el-form-item label="图注位置"><el-radio-group v-model="imageForm.captionPos"><el-radio-button value="">下方居中</el-radio-button><el-radio-button value="left">下方居左</el-radio-button><el-radio-button v-if="!isGallery" value="overlay">悬浮图上</el-radio-button><el-radio-button v-if="!isGallery" value="side">右侧</el-radio-button><el-radio-button value="none">隐藏</el-radio-button></el-radio-group></el-form-item>
          </el-form></div>
        </div>
        <template #footer><el-button v-if="imageForm.editRange" type="danger" link @click="removeFigure">从正文移除</el-button><el-button @click="imageDialog=false">取消</el-button><el-button type="primary" @click="confirmImage">{{imageForm.editRange?'保存修改':'插入正文'}}</el-button></template></el-dialog>
      <el-dialog v-model="templateDialog" title="用模板开始写作" width="min(980px,96vw)" class="template-writing-dialog"><div class="template-writing"><aside class="template-choices"><button v-for="item in templates" :key="item.id" type="button" :class="{active:selectedTemplate?.id===item.id}" @click="selectTemplate(item)"><strong>{{item.name}}</strong><span>{{item.description}}</span><small>{{item.builtin?'系统模板':'我的模板'}}</small></button></aside><section v-if="selectedTemplate" class="template-fields"><header><h3>{{selectedTemplate.name}}</h3><p>旅行、路线、行程和支出会自动读取；你只需写下只有自己知道的感受。</p></header><div v-for="block in templateBlocks" :key="block.id" class="template-field"><template v-if="block.type==='trip-info'"><label>{{block.title}}</label><div class="form-grid form-grid-2"><el-input v-model="templateData[block.id].weather" placeholder="天气，例如 晴 / 海风"/><el-input v-model="templateData[block.id].mood" placeholder="心情，例如 松弛 / 惊喜"/></div></template><template v-else-if="['text','textarea','quote'].includes(block.type)"><label>{{block.title}} <em v-if="block.required">必填</em></label><el-input v-model="templateData[block.id].value" :type="block.type==='text'?'text':'textarea'" :rows="block.type==='text'?1:4" :placeholder="block.config?.placeholder||'写下这一段'"/></template><template v-else-if="block.type==='rating'"><label>{{block.title}}</label><el-rate v-model="templateData[block.id].value" :max="block.config?.max||5" show-text/></template><template v-else-if="block.type==='image'"><label>{{block.title}}</label><el-select v-model="templateData[block.id].mediaIds" clearable placeholder="选择一张已上传图片"><el-option v-for="item in media" :key="item.id" :label="item.caption||item.filename" :value="item.id"/></el-select><small v-if="!media.length">先保存草稿并上传图片，之后可回来补充。</small></template><template v-else-if="block.type==='gallery'"><label>{{block.title}}</label><el-select v-model="templateData[block.id].mediaIds" multiple collapse-tags placeholder="选择已上传图片"><el-option v-for="item in media" :key="item.id" :label="item.caption||item.filename" :value="item.id"/></el-select><small v-if="!media.length">先保存草稿并上传图片，之后可回来补充。</small></template><div v-else class="template-auto-block"><strong>{{block.title}}</strong><span>将从当前旅行数据自动整理</span></div></div></section></div><template #footer><el-button @click="templateDialog=false">取消</el-button><el-button type="primary" :loading="generating" @click="generateFromTemplate">生成日记正文</el-button></template></el-dialog>
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
        {value:'checklist',label:'清单',desc:'待办清单，生成为 Markdown 的 - [ ] 列表。'},
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
      const sampleHtml=blocks=>DOMPurify.sanitize(marked.parse(renderTemplateSample(blocks),{breaks:true}));
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
      <el-dialog v-model="previewDialog" :title="(previewing?.name||'模板')+' · 预览'" width="min(860px,96vw)" class="template-preview-dialog"><p class="template-preview-note">下面是用示例旅行数据渲染的效果，实际生成时会换成这篇日记所属旅行的真实内容。</p><article ref="previewEl" class="preview markdown-body template-preview-body" v-html="previewHtml"></article><template #footer><el-button @click="previewDialog=false">关闭</el-button><el-button v-if="previewing" type="primary" @click="previewDialog=false;duplicate(previewing)">复制为我的模板</el-button></template></el-dialog>
      <el-dialog v-model="dialog" :title="editing?'编辑我的模板':'新建我的模板'" width="min(1320px,96vw)" class="template-editor-dialog"><el-form label-position="top"><div class="form-grid form-grid-2"><el-form-item label="模板名称"><el-input v-model="form.name" maxlength="120" placeholder="例如：海边慢游的一天"/></el-form-item><el-form-item label="是否启用"><el-switch v-model="form.enabled" active-text="启用" inactive-text="停用"/></el-form-item></div><el-form-item label="模板说明"><el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" show-word-limit/></el-form-item></el-form>
        <div class="block-library"><span>添加区块</span><el-tooltip v-for="type in blockTypes" :key="type.value" :content="type.desc" placement="top" :show-after="200" popper-class="block-tip"><button type="button" :class="{auto:type.auto}" @click="addBlock(type.value)">＋ {{type.label}}<i v-if="type.auto" aria-hidden="true">自动</i></button></el-tooltip></div>
        <div class="template-workbench">
        <div class="template-builder"><el-empty v-if="!form.definitionJson.blocks.length" description="从上方添加第一个区块"/><article v-for="(block,index) in form.definitionJson.blocks" :key="block.id" class="template-block-editor"><div class="block-order"><button type="button" :disabled="index===0" @click="move(index,-1)">↑</button><strong>{{index+1}}</strong><button type="button" :disabled="index===form.definitionJson.blocks.length-1" @click="move(index,1)">↓</button></div><div class="block-fields"><div class="block-title-row"><el-input v-model="block.title" placeholder="区块标题，显示为正文里的小标题"><template #prepend>{{blockLabel(block.type)}}</template></el-input><el-switch v-model="block.required" active-text="必填" inactive-text="选填"/></div>
              <p class="block-desc">{{blockMeta(block.type).desc}}</p>
              <el-input v-if="['text','textarea','quote'].includes(block.type)" v-model="block.config.placeholder" placeholder="填写提示语"/>
              <el-select v-if="block.type==='route'" v-model="block.config.source"><el-option label="路线来源：当天行程条目" value="itinerary"/><el-option label="路线来源：整趟旅行的城市顺序" value="trip"/></el-select>
              <el-select v-if="block.type==='expense-summary'" v-model="block.config.source"><el-option label="统计范围：日记当天的支出" value="expense"/><el-option label="统计范围：整趟旅行的全部支出" value="trip"/></el-select>
              <el-input-number v-if="block.type==='rating'" v-model="block.config.max" :min="3" :max="10" controls-position="right" style="width:140px"/><div v-if="['image','gallery'].includes(block.type)" class="form-grid form-grid-2"><el-select v-model="block.config.imageSize"><el-option label="小图" value="small"/><el-option label="中图" value="medium"/><el-option label="大图" value="large"/><el-option label="满宽" value="full"/><el-option label="通栏出血" value="bleed"/></el-select><el-select v-model="block.config.align"><el-option label="居左" value="left"/><el-option label="居中" value="center"/><el-option label="居右" value="right"/></el-select></div><el-select v-if="block.type==='gallery'" v-model="block.config.layout" placeholder="图组排布"><el-option label="竖向逐张排列" value="stack"/><el-option label="并排" value="row"/><el-option label="网格" value="grid"/><el-option label="瀑布流" value="masonry"/><el-option label="拼贴" value="mosaic"/><el-option label="轮播" value="carousel"/><el-option label="胶片条" value="filmstrip"/><el-option label="前后对比" value="compare"/></el-select></div><div class="block-actions"><button type="button" @click="copyBlock(index)">复制</button><button type="button" class="danger" @click="form.definitionJson.blocks.splice(index,1)">删除</button></div></article></div>
        <aside class="template-live-preview"><div class="template-live-head">实时预览<small>示例数据</small></div><article ref="builderPreviewEl" class="preview markdown-body template-preview-body" v-html="builderPreview"></article><div v-if="!form.definitionJson.blocks.length" class="template-live-empty">添加区块后这里会显示生成的日记长什么样</div></aside>
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
      return { session, avatarInput, avatarUrl, uploading, password, changingPassword, chooseAvatar, picked, changePassword,
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
      return {session,themes,changing,editor,editing,previewFrame,previewMode,previewWrap,stageStyle,frameStyle,importInput,form,colorFields,contrast,canUndo,canRedo,selectTheme,openEditor,duplicateTheme,saveTheme,removeTheme,postPreview,exportTheme,chooseImport,imported,undo,redo,resetEditor};
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
        </section><section class="theme-live"><header><strong>网站实时预览</strong><div><button type="button" :class="{active:previewMode==='desktop'}" @click="previewMode='desktop'">桌面</button><button type="button" :class="{active:previewMode==='mobile'}" @click="previewMode='mobile'">手机</button></div></header><div ref="previewWrap" class="theme-frame-wrap" :class="previewMode"><div class="preview-stage" :style="stageStyle"><iframe ref="previewFrame" :style="frameStyle" src="/?theme-preview=1" title="主题实时预览" @load="postPreview"></iframe></div></div></section></div>
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
        <nav class="side-nav"><router-link to="/" title="管理首页" @click="drawer=false"><i aria-hidden="true">⌂</i><span>管理首页</span></router-link><router-link to="/trips" title="旅行管理" @click="drawer=false"><i aria-hidden="true">▣</i><span>旅行管理</span></router-link><router-link to="/templates" title="日记模板" @click="drawer=false"><i aria-hidden="true">▤</i><span>日记模板</span></router-link><router-link to="/themes" title="主题外观" @click="drawer=false"><i aria-hidden="true">◈</i><span>主题外观</span></router-link><router-link to="/profile" title="个人资料" @click="drawer=false"><i aria-hidden="true">◎</i><span>个人资料</span></router-link><a href="/" target="_blank" title="查看网站" @click="drawer=false"><i aria-hidden="true">↗</i><span>查看网站</span></a></nav>
        <div class="sidebar-user" :title="session.user?.displayName"><div class="sidebar-avatar"><img v-if="session.user?.avatarUrl" :src="session.user.avatarUrl" alt="头像"><span v-else>{{session.user?.displayName?.slice(0,1) || '旅'}}</span></div><div><div>{{session.user?.displayName}}</div><small>{{session.user?.username}}</small></div></div></aside>
      <main class="admin-main"><template v-if="!full"><header class="admin-topbar"><el-button class="mobile-toggle" @click="drawer=!drawer">☰</el-button><h1>{{route.meta.title}}</h1><div class="top-actions"><el-button link @click="logout">退出登录</el-button></div></header><div class="admin-content"><router-view></router-view></div></template><router-view v-else></router-view></main>
    </div>`
  };

  createApp(App)
    .use(router)
    .use(ElementPlus, { locale: window.ElementPlusLocaleZhCn })
    .mount('#admin-app');
})();
