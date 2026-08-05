(function () {
  const { createApp, ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } = Vue;
  const api = window.TravelApi;
  const A = api.admin;
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
    try { session.user = await api.auth.me(); await api.ensureCsrf(); }
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
      const data = ref([]), loading = ref(false), dialog = ref(false), editing = ref(null), keyword = ref('');
      const form = reactive(blankTrip());
      function blankTrip() { return { title:'',slug:'',summary:'',status:'PLANNING',startDate:'',endDate:'',defaultCurrency:'CNY',coverMediaId:null,internalNote:'' }; }
      async function load() { loading.value=true; try { data.value=(await A.trips({page:1,pageSize:100,keyword:keyword.value})).items; } catch(e){fail(e);} finally{loading.value=false;} }
      function open(item) { editing.value=item?.id||null; Object.assign(form, item||blankTrip()); dialog.value=true; }
      async function save() { try { if(editing.value) await A.updateTrip(editing.value,form); else await A.createTrip(form); dialog.value=false; message('旅行已保存'); load(); } catch(e){fail(e);} }
      onMounted(load);
      return { data,loading,dialog,editing,keyword,form,load,open,save,tripStatusOptions,statusLabel };
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
          <el-form-item label="内部备注"><el-input v-model="form.internalNote" type="textarea" :rows="2"/></el-form-item>
        </el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
      </el-dialog></div>`
  };

  const TripWorkspace = {
    setup() {
      const route = VueRouter.useRoute(); const router = VueRouter.useRouter(); const id = Number(route.params.id);
      const trip = ref(null), dashboard=ref(null), stops=ref([]), itinerary=ref([]), budget=ref(null), expenses=ref([]), journals=ref([]);
      const active=ref('overview'), dialog=ref(''), editing=ref(null);
      const stopForm=reactive(blankStop()), itemForm=reactive(blankItem()), expenseForm=reactive(blankExpense());
      function blankStop(){return{cityName:'',regionName:'',countryName:'',countryCode:'',latitude:0,longitude:0,arrivalDate:null,departureDate:null,sortOrder:0,note:''};}
      function blankItem(){return{tripStopId:null,itemDate:'',startTime:null,endTime:null,type:'ATTRACTION',title:'',address:'',note:'',plannedCost:0,completed:false,sortOrder:0,allowOutsideTripDates:false};}
      function blankExpense(){return{budgetCategoryId:null,tripStopId:null,expenseDate:'',amount:0,description:'',merchant:'',note:''};}
      async function loadAll(){try{[trip.value,dashboard.value,stops.value,itinerary.value,budget.value,expenses.value]=await Promise.all([A.trip(id),A.dashboard(id),A.stops(id),A.itinerary(id),A.budget(id),A.expenses(id)]);journals.value=(await A.journals({page:1,pageSize:100,tripId:id})).items;}catch(e){fail(e);}}
      function openStop(row){editing.value=row?.id||null;Object.assign(stopForm,row||blankStop());dialog.value='stop';}
      function openItem(row){editing.value=row?.id||null;Object.assign(itemForm,row||blankItem());dialog.value='item';}
      function openExpense(row){editing.value=row?.id||null;Object.assign(expenseForm,row||blankExpense());dialog.value='expense';}
      async function saveStop(){try{editing.value?await A.updateStop(editing.value,stopForm):await A.createStop(id,stopForm);dialog.value='';message('城市已保存');loadAll();}catch(e){fail(e);}}
      async function saveItem(){try{editing.value?await A.updateItinerary(editing.value,itemForm):await A.createItinerary(id,itemForm);dialog.value='';message('行程已保存');loadAll();}catch(e){fail(e);}}
      async function saveExpense(){try{editing.value?await A.updateExpense(editing.value,expenseForm):await A.createExpense(id,expenseForm);dialog.value='';message('支出已保存');loadAll();}catch(e){fail(e);}}
      async function remove(kind,row){try{await confirm('确定删除这条记录吗？');if(kind==='stop')await A.deleteStop(row.id);if(kind==='item')await A.deleteItinerary(row.id);if(kind==='expense')await A.deleteExpense(row.id);message('已删除');loadAll();}catch(e){if(e!=='cancel'&&e!=='close')fail(e);}}
      async function saveCategory(row){try{await A.updateCategory(row.id,{code:row.code,name:row.name,plannedAmount:row.planned,sortOrder:0});message('预算已更新');loadAll();}catch(e){fail(e);}}
      async function removeJournal(row){try{await confirm('确定删除这篇草稿吗？');await A.deleteJournal(row.id);message('草稿已删除');loadAll();}catch(e){if(e!=='cancel'&&e!=='close')fail(e);}}
      onMounted(loadAll);
      return {trip,dashboard,stops,itinerary,budget,expenses,journals,active,dialog,editing,stopForm,itemForm,expenseForm,openStop,openItem,openExpense,saveStop,saveItem,saveExpense,remove,saveCategory,removeJournal,router,itineraryTypeOptions,statusLabel,itineraryTypeLabel};
    },
    template: `<div v-if="trip"><div class="workspace-head"><span class="back" @click="router.push('/trips')">← 返回</span><div><h2>{{trip.title}}</h2><div class="workspace-meta">{{trip.startDate}} — {{trip.endDate}} · {{statusLabel(trip.status)}}</div></div></div>
      <el-tabs v-model="active" class="workspace-tabs">
        <el-tab-pane label="概览" name="overview"><div class="dashboard-grid"><div class="metric"><span>城市</span><strong>{{dashboard.stopCount}}</strong></div><div class="metric"><span>行程</span><strong>{{dashboard.itineraryCount}}</strong></div><div class="metric"><span>草稿</span><strong>{{dashboard.draftCount}}</strong></div><div class="metric"><span>已发布</span><strong>{{dashboard.publishedCount}}</strong></div></div><p>{{trip.summary||'还没有旅行简介。'}}</p></el-tab-pane>
        <el-tab-pane label="城市" name="stops"><div class="tab-actions"><el-button type="primary" @click="openStop()">添加城市</el-button></div><el-table :data="stops" max-height="calc(100vh - 360px)"><el-table-column prop="cityName" label="城市"/><el-table-column prop="countryName" label="国家"/><el-table-column prop="arrivalDate" label="到达"/><el-table-column prop="departureDate" label="离开"/><el-table-column label="操作" width="140"><template #default="{row}"><el-button link @click="openStop(row)">编辑</el-button><el-button link type="danger" @click="remove('stop',row)">删除</el-button></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="行程" name="itinerary"><div class="tab-actions"><el-button type="primary" @click="openItem()">添加行程</el-button></div><el-table :data="itinerary" max-height="calc(100vh - 360px)"><el-table-column prop="itemDate" label="日期" width="120"/><el-table-column prop="startTime" label="时间" width="100"/><el-table-column label="类型" width="110"><template #default="{row}">{{itineraryTypeLabel(row.type)}}</template></el-table-column><el-table-column prop="title" label="行程"/><el-table-column label="完成" width="80"><template #default="{row}"><el-checkbox v-model="row.completed" @change="A.completeItinerary(row.id,row.completed)"/></template></el-table-column><el-table-column label="操作" width="140"><template #default="{row}"><el-button link @click="openItem(row)">编辑</el-button><el-button link type="danger" @click="remove('item',row)">删除</el-button></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="预算" name="budget"><div class="budget-summary"><div class="item"><span>总预算</span><strong>{{budget.currency}} {{budget.plannedTotal}}</strong></div><div class="item"><span>已支出</span><strong>{{budget.currency}} {{budget.actualTotal}}</strong></div><div class="item"><span>剩余</span><strong :class="{over:budget.remaining<0}">{{budget.currency}} {{budget.remaining}}</strong></div></div><el-table :data="budget.categories" max-height="calc(100vh - 430px)"><el-table-column prop="name" label="分类"/><el-table-column label="计划金额"><template #default="{row}"><el-input-number v-model="row.planned" :min="0" :precision="2"/></template></el-table-column><el-table-column prop="actual" label="实际支出"/><el-table-column prop="remaining" label="剩余"/><el-table-column width="90"><template #default="{row}"><el-button link @click="saveCategory(row)">保存</el-button></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="支出" name="expenses"><div class="tab-actions"><el-button type="primary" @click="openExpense()">记录支出</el-button></div><el-table :data="expenses" max-height="calc(100vh - 360px)"><el-table-column prop="expenseDate" label="日期"/><el-table-column prop="description" label="说明"/><el-table-column prop="merchant" label="商户"/><el-table-column prop="amount" label="金额"/><el-table-column label="操作" width="140"><template #default="{row}"><el-button link @click="openExpense(row)">编辑</el-button><el-button link type="danger" @click="remove('expense',row)">删除</el-button></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="日记" name="journals"><div class="tab-actions"><el-button type="primary" @click="router.push('/journals/new?tripId='+trip.id)">新建日记</el-button></div><el-table :data="journals" max-height="calc(100vh - 360px)"><el-table-column prop="title" label="标题"/><el-table-column prop="occurredOn" label="日期"/><el-table-column label="状态"><template #default="{row}">{{statusLabel(row.status)}}</template></el-table-column><el-table-column label="操作" width="150"><template #default="{row}"><el-button link @click="router.push('/journals/'+row.id)">编辑</el-button><el-button link type="danger" @click="removeJournal(row)">删除</el-button></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="设置" name="settings"><el-descriptions border :column="1"><el-descriptions-item label="Slug">{{trip.slug}}</el-descriptions-item><el-descriptions-item label="默认币种">{{trip.defaultCurrency}}</el-descriptions-item><el-descriptions-item label="内部备注">{{trip.internalNote||'无'}}</el-descriptions-item></el-descriptions><el-button style="margin-top:18px" @click="router.push('/themes')">查看主题外观</el-button></el-tab-pane>
      </el-tabs>
      <el-dialog :model-value="dialog==='stop'" :title="editing?'编辑城市':'添加城市'" width="min(650px,92vw)" @closed="editing=null" v-if="dialog==='stop'"><el-form label-position="top"><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="城市"><el-input v-model="stopForm.cityName"/></el-form-item><el-form-item label="国家"><el-input v-model="stopForm.countryName"/></el-form-item></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="纬度"><el-input-number v-model="stopForm.latitude" :precision="6"/></el-form-item><el-form-item label="经度"><el-input-number v-model="stopForm.longitude" :precision="6"/></el-form-item></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="到达日期"><el-date-picker v-model="stopForm.arrivalDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD"/></el-form-item><el-form-item label="离开日期"><el-date-picker v-model="stopForm.departureDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD"/></el-form-item></div><el-form-item label="备注"><el-input v-model="stopForm.note" type="textarea"/></el-form-item></el-form><template #footer><el-button @click="dialog=''">取消</el-button><el-button type="primary" @click="saveStop">保存</el-button></template></el-dialog>
      <el-dialog :model-value="dialog==='item'" :title="editing?'编辑行程':'添加行程'" width="min(650px,92vw)" @closed="editing=null" v-if="dialog==='item'"><el-form label-position="top"><el-form-item label="标题"><el-input v-model="itemForm.title"/></el-form-item><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="日期"><el-date-picker v-model="itemForm.itemDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD"/></el-form-item><el-form-item label="类型"><el-select v-model="itemForm.type"><el-option v-for="x in itineraryTypeOptions" :key="x.value" :label="x.label" :value="x.value"/></el-select></el-form-item></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="开始"><el-time-picker v-model="itemForm.startTime" format="HH时mm分" value-format="HH:mm:ss" placeholder="开始时间"/></el-form-item><el-form-item label="结束"><el-time-picker v-model="itemForm.endTime" format="HH时mm分" value-format="HH:mm:ss" placeholder="结束时间"/></el-form-item></div><el-form-item label="地址"><el-input v-model="itemForm.address"/></el-form-item><el-form-item label="备注"><el-input v-model="itemForm.note" type="textarea"/></el-form-item></el-form><template #footer><el-button @click="dialog=''">取消</el-button><el-button type="primary" @click="saveItem">保存</el-button></template></el-dialog>
      <el-dialog :model-value="dialog==='expense'" :title="editing?'编辑支出':'记录支出'" width="min(600px,92vw)" @closed="editing=null" v-if="dialog==='expense'"><el-form label-position="top"><el-form-item label="说明"><el-input v-model="expenseForm.description"/></el-form-item><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><el-form-item label="日期"><el-date-picker v-model="expenseForm.expenseDate" format="YYYY年MM月DD日" value-format="YYYY-MM-DD"/></el-form-item><el-form-item label="金额"><el-input-number v-model="expenseForm.amount" :min="0.01" :precision="2"/></el-form-item></div><el-form-item label="分类"><el-select v-model="expenseForm.budgetCategoryId"><el-option v-for="x in budget.categories" :key="x.id" :label="x.name" :value="x.id"/></el-select></el-form-item><el-form-item label="商户"><el-input v-model="expenseForm.merchant"/></el-form-item><el-form-item label="备注"><el-input v-model="expenseForm.note" type="textarea"/></el-form><template #footer><el-button @click="dialog=''">取消</el-button><el-button type="primary" @click="saveExpense">保存</el-button></template></el-dialog>
    </div><div v-else style="padding:80px;text-align:center">正在打开旅行工作台…</div>`
  };

  const JournalEditor = {
    setup() {
      const route=VueRouter.useRoute(),router=VueRouter.useRouter(), id=ref(route.params.id==='new'?null:Number(route.params.id));
      const trips=ref([]),stops=ref([]),media=ref([]),uploading=ref(false),saving=ref(false),dirty=ref(false),fileInput=ref(null),textarea=ref(null);
      const form=reactive({tripId:route.query.tripId?Number(route.query.tripId):null,tripStopId:null,title:'',slug:'',excerpt:'',contentMarkdown:'',occurredOn:'',coverMediaId:null,status:'DRAFT'});
      const html=computed(()=>DOMPurify.sanitize(marked.parse(form.contentMarkdown||'',{breaks:true})));
      async function load(){try{trips.value=(await A.trips({page:1,pageSize:100})).items;if(id.value){Object.assign(form,await A.journal(id.value));media.value=await A.media(id.value);}if(form.tripId)stops.value=await A.stops(form.tripId);dirty.value=false;}catch(e){fail(e);}}
      watch(()=>form.tripId,async value=>{if(value)stops.value=await A.stops(value);});
      watch(form,()=>dirty.value=true,{deep:true});
      async function save(){saving.value=true;try{const body={tripId:form.tripId,tripStopId:form.tripStopId,title:form.title,slug:form.slug,excerpt:form.excerpt,contentMarkdown:form.contentMarkdown,occurredOn:form.occurredOn,coverMediaId:form.coverMediaId};if(id.value)await A.updateJournal(id.value,body);else{const created=await A.createJournal(body);id.value=created.id;router.replace('/journals/'+created.id);}dirty.value=false;message('草稿已保存');}catch(e){fail(e);}finally{saving.value=false;}}
      async function publish(){try{await save();await A.publishJournal(id.value);form.status='PUBLISHED';message('日记已发布');}catch(e){fail(e);}}
      async function unpublish(){try{await A.unpublishJournal(id.value);form.status='DRAFT';message('日记已撤回');}catch(e){fail(e);}}
      async function upload(file){if(!id.value){ElementPlus.ElMessage.warning('请先保存草稿，再上传图片');return;}uploading.value=true;try{const fd=new FormData();fd.append('file',file);const item=await A.uploadMedia(id.value,fd);media.value.push(item);insertImage(item);message('图片已上传并插入正文');}catch(e){fail(e);}finally{uploading.value=false;}}
      function choose(){fileInput.value.click();}
      function picked(event){const file=event.target.files[0];if(file)upload(file);event.target.value='';}
      function onPaste(event){const file=Array.from(event.clipboardData?.files||[]).find(x=>x.type.startsWith('image/'));if(file){event.preventDefault();upload(file);}}
      function insertImage(item){const syntax='\n!['+(item.caption||item.filename)+']('+item.displayUrl+')\n';const el=textarea.value?.$el?.querySelector('textarea');if(!el){form.contentMarkdown+=syntax;return;}const start=el.selectionStart||form.contentMarkdown.length;form.contentMarkdown=form.contentMarkdown.slice(0,start)+syntax+form.contentMarkdown.slice(el.selectionEnd||start);nextTick(()=>{el.focus();el.selectionStart=el.selectionEnd=start+syntax.length;});}
      async function setCover(item){try{await A.setCover(id.value,item.id);form.coverMediaId=item.id;message('已设为封面');}catch(e){fail(e);}}
      async function removeMedia(item){try{await confirm('确定删除这张图片吗？');await A.deleteMedia(item.relationId);media.value=media.value.filter(x=>x.relationId!==item.relationId);message('图片已删除');}catch(e){if(e!=='cancel'&&e!=='close')fail(e);}}
      function beforeUnload(e){if(dirty.value){e.preventDefault();e.returnValue='';}}
      onMounted(()=>{load();window.addEventListener('beforeunload',beforeUnload);});onBeforeUnmount(()=>window.removeEventListener('beforeunload',beforeUnload));
      return{form,trips,stops,media,html,id,uploading,saving,fileInput,textarea,save,publish,unpublish,choose,picked,onPaste,insertImage,setCover,removeMedia,router,statusLabel};
    },
    template: `<div class="editor-page"><div class="editor-top"><el-button link @click="router.back()">← 返回</el-button><h2>编辑旅行日记</h2><span class="status">{{statusLabel(form.status)}}</span><div class="editor-actions"><el-button :loading="saving" @click="save">保存草稿</el-button><el-button v-if="form.status==='PUBLISHED'" @click="unpublish">撤回</el-button><el-button type="primary" @click="publish">发布日记</el-button></div></div>
      <div class="editor-meta"><el-input v-model="form.title" placeholder="日记标题"/><el-select v-model="form.tripId" placeholder="所属旅行"><el-option v-for="x in trips" :key="x.id" :label="x.title" :value="x.id"/></el-select><el-select v-model="form.tripStopId" clearable placeholder="城市"><el-option v-for="x in stops" :key="x.id" :label="x.cityName" :value="x.id"/></el-select><el-date-picker v-model="form.occurredOn" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="发生日期"/></div>
      <div class="editor-meta" style="grid-template-columns:1fr 2fr"><el-input v-model="form.slug" placeholder="slug，例如 tokyo-spring"/><el-input v-model="form.excerpt" placeholder="摘要"/></div>
      <div class="editor-grid"><section class="editor-column"><div class="editor-label">Markdown 编辑</div><el-input ref="textarea" class="markdown-input" v-model="form.contentMarkdown" type="textarea" @paste="onPaste"/></section>
        <section class="editor-column"><div class="editor-label">实时预览</div><article class="preview" v-html="html"></article></section>
        <aside class="editor-column"><div class="editor-label">图片管理</div><div class="media-side"><div class="upload-box" @click="choose"><span v-if="!uploading">选择、拖拽或粘贴图片<br><small>JPEG / PNG / WebP</small></span><span v-else>正在上传…</span></div><input ref="fileInput" hidden type="file" accept="image/jpeg,image/png,image/webp" @change="picked">
          <div v-for="item in media" :key="item.id" class="media-item"><img :src="item.thumbnailUrl"><div><small>{{item.filename}}</small><div><el-button link size="small" @click="insertImage(item)">插入</el-button><el-button link size="small" @click="setCover(item)">{{form.coverMediaId===item.id?'当前封面':'设封面'}}</el-button><el-button link type="danger" size="small" @click="removeMedia(item)">删除</el-button></div></div></div>
        </div></aside></div>
    </div>`
  };

  const Theme = {
    template: `<div><div class="page-head"><div><h2>主题外观</h2><p>首版使用已经确认的旅行杂志视觉方向。</p></div></div><div class="panel theme-preview"><img src="/img/theme-travel-classic-preview.png" @error="$event.target.style.display='none'"><div class="theme-info"><div><h3>远行手记</h3><p>暖白纸张感、森林绿与陶土色的旅行杂志主题</p></div><span class="theme-badge">当前主题</span></div></div><el-alert style="margin-top:18px" title="更多主题后续开放" description="当前版本已预留 CSS 变量和主题入口，暂不提供切换与自定义编辑。" type="info" :closable="false"/></div>`
  };

  const routes=[
    {path:'/login',component:Login,meta:{public:true,title:'登录'}},
    {path:'/',component:Dashboard,meta:{title:'管理首页'}},
    {path:'/trips',component:Trips,meta:{title:'旅行管理'}},
    {path:'/trips/:id',component:TripWorkspace,meta:{title:'旅行工作台'}},
    {path:'/journals/:id',component:JournalEditor,meta:{title:'编辑旅行日记',full:true}},
    {path:'/themes',component:Theme,meta:{title:'主题外观'}}
  ];
  const router=VueRouter.createRouter({history:VueRouter.createWebHashHistory(),routes});
  router.beforeEach(async to=>{if(to.meta.public)return true;const user=await loadSession();return user?true:'/login';});

  const App = {
    setup() {
      const drawer=ref(false); const route=VueRouter.useRoute();
      const full=computed(()=>route.meta.full);
      async function logout(){try{await api.auth.logout();session.user=null;session.checked=true;router.replace('/login');}catch(e){fail(e);}}
      return{session,drawer,route,full,logout};
    },
    template: `<router-view v-if="route.meta.public"></router-view><div v-else class="admin-shell">
      <aside class="admin-sidebar" :class="{open:drawer}"><div class="sidebar-brand">远行手记<small>TRAVEL JOURNAL</small></div><nav class="side-nav"><router-link to="/">⌂ 管理首页</router-link><router-link to="/trips">▣ 旅行管理</router-link><router-link to="/themes">◈ 主题外观</router-link><a href="/" target="_blank">↗ 查看网站</a></nav><div class="sidebar-user"><div>{{session.user?.displayName}}</div><small>{{session.user?.username}}</small></div></aside>
      <main class="admin-main"><template v-if="!full"><header class="admin-topbar"><el-button class="mobile-toggle" @click="drawer=!drawer">☰</el-button><h1>{{route.meta.title}}</h1><div class="top-actions"><el-button link @click="logout">退出登录</el-button></div></header><div class="admin-content"><router-view></router-view></div></template><router-view v-else></router-view></main>
    </div>`
  };

  createApp(App)
    .use(router)
    .use(ElementPlus, { locale: window.ElementPlusLocaleZhCn })
    .mount('#admin-app');
})();
