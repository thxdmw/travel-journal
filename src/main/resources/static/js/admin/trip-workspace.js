/* 已迁移页面的短期装配桥；页面实现位于 frontend/src/admin/pages。 */
(function () {
  const { message, fail, confirm, session, rememberSession, applyTheme } = window.AdminShared;
  const factories = document.getElementById('admin-app')?.[Symbol.for('travel-journal.admin-pages')];
  if (!factories?.createDashboardPage || !factories.createLoginPage || !factories.createTripsPage || !factories.createTripWorkspacePage) {
    throw new Error('后台 SFC 页面注册不完整');
  }
  Object.assign(window.AdminPages, {
    Login: factories.createLoginPage({
      completeSession: user => { session.user=user;session.checked=true;session.offline=false; },
      rememberSession, applyTheme, fail
    }),
    Dashboard: factories.createDashboardPage({ fail }),
    Trips: factories.createTripsPage({ message, warning: text => ElementPlus.ElMessage.warning(text), fail }),
    TripWorkspace: factories.createTripWorkspacePage({
      message,
      warning: text => ElementPlus.ElMessage.warning(text),
      error: text => ElementPlus.ElMessage.error(text),
      info: text => ElementPlus.ElMessage.info(text),
      fail,
      confirm
    })
  });
})();
