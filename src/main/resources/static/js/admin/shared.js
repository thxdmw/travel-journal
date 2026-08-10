/* 后台各页面共用的工具、常量与会话状态。必须最先加载。 */
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


  // 页面拆到了 js/admin/ 下的多个文件里，彼此不通过模块系统，而是走这个全局对象。
  // 保持项目「Spring Boot Jar + Vue 全局版 + 无前端构建」的约定不变。
  window.AdminShared = {
    api, A, JM, applyTheme, message, fail, confirm, session, loadSession,
    tripStatusOptions, itineraryTypeOptions, journalStatusLabels, statusLabel, itineraryTypeLabel,
    shortTime, timeRange, IMAGE_TYPES, TAB_ORDER, renderTemplateSample,
    required, check, slugRule, validateForm, fillForm
  };
  window.AdminPages = window.AdminPages || {};
})();
