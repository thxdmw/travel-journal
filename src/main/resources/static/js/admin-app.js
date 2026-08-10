/* 后台外壳：路由表、侧边栏与挂载。页面组件在 js/admin/ 下的各文件里。 */
(function () {
  const { createApp, ref, computed, watch } = Vue;
  const { api, session, loadSession, applyTheme, fail } = window.AdminShared;
  const { Login, Dashboard, Trips, TripWorkspace, JournalEditor,
    TemplateManager, Theme, Profile, TagManager, Moments } = window.AdminPages;

  const routes=[
    {path:'/login',component:Login,meta:{public:true,title:'登录'}},
    {path:'/',component:Dashboard,meta:{title:'管理首页'}},
    {path:'/trips',component:Trips,meta:{title:'旅行管理'}},
    {path:'/trips/:id',component:TripWorkspace,meta:{title:'旅行工作台'}},
    {path:'/moments',component:Moments,meta:{title:'随手记'}},
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
        <nav class="side-nav"><router-link to="/" title="管理首页" @click="drawer=false"><i aria-hidden="true">⌂</i><span>管理首页</span></router-link><router-link to="/trips" title="旅行管理" @click="drawer=false"><i aria-hidden="true">▣</i><span>旅行管理</span></router-link><router-link to="/moments" title="随手记" @click="drawer=false"><i aria-hidden="true">✎</i><span>随手记</span></router-link><router-link to="/templates" title="日记模板" @click="drawer=false"><i aria-hidden="true">▤</i><span>日记模板</span></router-link><router-link to="/tags" title="标签管理" @click="drawer=false"><i aria-hidden="true">◇</i><span>标签管理</span></router-link><router-link to="/themes" title="主题外观" @click="drawer=false"><i aria-hidden="true">◈</i><span>主题外观</span></router-link><router-link to="/profile" title="个人资料" @click="drawer=false"><i aria-hidden="true">◎</i><span>个人资料</span></router-link><a href="/" target="_blank" title="查看网站" @click="drawer=false"><i aria-hidden="true">↗</i><span>查看网站</span></a></nav>
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
