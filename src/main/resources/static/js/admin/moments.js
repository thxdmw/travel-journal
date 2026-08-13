/* 随手记已迁到 SFC；迁移期只保留旧页面注册表接线。 */
(function () {
  const { message, fail, confirm, session } = window.AdminShared;
  const adminPages = document.getElementById('admin-app')?.[Symbol.for('travel-journal.admin-pages')];
  if (!adminPages?.createMomentsPage) throw new Error('后台 SFC 页面注册不完整');
  const Moments = adminPages.createMomentsPage({
    session,
    message,
    warning: text => ElementPlus.ElMessage.warning(text),
    error: text => ElementPlus.ElMessage.error(text),
    info: text => ElementPlus.ElMessage.info(text),
    fail,
    confirm,
    composeConfirm: text => ElementPlus.ElMessageBox.confirm(text, '再整理一次', {
      confirmButtonText: '追加',
      cancelButtonText: '替换整篇',
      distinguishCancelAndClose: true,
      type: 'info'
    })
  });
  Object.assign(window.AdminPages, { Moments });
})();
