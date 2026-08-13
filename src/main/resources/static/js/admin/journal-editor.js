/* 日记页面已迁移到 SFC；此文件只负责旧脚本加载顺序下的装配。 */
(function () {
  const factories = document.getElementById('admin-app')?.[Symbol.for('travel-journal.admin-pages')];
  if (!factories?.createJournalEditorPage) throw new Error('日记编辑器 SFC 未注册');
  Object.assign(window.AdminPages, {
    JournalEditor: factories.createJournalEditorPage({
      message: text => ElementPlus.ElMessage.success(text),
      info: text => ElementPlus.ElMessage.info(text),
      warning: text => ElementPlus.ElMessage.warning(text),
      fail: error => ElementPlus.ElMessage.error(error?.message || '操作失败'),
      confirm: text => ElementPlus.ElMessageBox.confirm(text, '请确认', { type: 'warning' })
    })
  });
})();
