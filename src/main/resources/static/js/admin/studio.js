/* 已迁移页面的短期装配桥；页面实现位于 frontend/src/admin/pages。 */
(function () {
  const { message, fail, confirm, session } = window.AdminShared;
  const factories = document.getElementById('admin-app')?.[Symbol.for('travel-journal.admin-pages')];
  if (!factories?.createProfilePage || !factories.createTagManagerPage || !factories.createTemplateManagerPage || !factories.createThemeStudioPage) throw new Error('后台 SFC 页面注册不完整');
  Object.assign(window.AdminPages, {
    TemplateManager: factories.createTemplateManagerPage({ message, warning: text => ElementPlus.ElMessage.warning(text), fail, confirm }),
    Profile: factories.createProfilePage({ session, updateUser: user => { session.user = user; }, message, fail }),
    TagManager: factories.createTagManagerPage({ message, fail, confirm, warning: text => ElementPlus.ElMessage.warning(text) }),
    Theme: factories.createThemeStudioPage({ session, updateUser: user => { session.user = user; }, message, fail, confirm })
  });
})();
