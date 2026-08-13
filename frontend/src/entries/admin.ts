import { createApp, reactive, type Plugin } from 'vue'
import { authApi } from '@/api/auth'
import { ensureCsrf } from '@/api/client'
import { publicApi } from '@/api/public'
import AdminAppShell from '@/admin/AdminAppShell.vue'
import { createDashboardPage } from '@/admin/factories/dashboard'
import { createJournalEditorPage } from '@/admin/factories/journal-editor'
import { createLoginPage } from '@/admin/factories/login'
import { createMomentsPage } from '@/admin/factories/moments'
import { createProfilePage } from '@/admin/factories/profile'
import { createTagManagerPage } from '@/admin/factories/tag-manager'
import { createTemplateManagerPage } from '@/admin/factories/template-manager'
import { createThemeStudioPage } from '@/admin/factories/theme-studio'
import { createTripsPage } from '@/admin/factories/trips'
import { createTripWorkspacePage } from '@/admin/factories/trip-workspace'
import { createRouter, createWebHashHistory, type PublicRouteRecord } from '@/vendor/vue-router-global'
import { apply, stored } from '@/theme/theme'
import type { AdminInfo } from '@/types/auth'
import { installCustomCursor } from '@/enhancements/custom-cursor'
import { installPwa } from '@/enhancements/pwa'

interface ElementPlusRuntime {
  ElMessage: { success(text:string):void; warning(text:string):void; error(text:string):void; info(text:string):void }
  ElMessageBox: { confirm(text:string,title:string,options:Record<string,unknown>):Promise<unknown> }
}
const elementPlus=(window as typeof window&{ElementPlus:Plugin<[{locale:unknown}]>&ElementPlusRuntime}).ElementPlus
const locale=(window as typeof window&{ElementPlusLocaleZhCn:unknown}).ElementPlusLocaleZhCn
const message=(text:string)=>elementPlus.ElMessage.success(text)
const warning=(text:string)=>elementPlus.ElMessage.warning(text)
const error=(text:string)=>elementPlus.ElMessage.error(text)
const info=(text:string)=>elementPlus.ElMessage.info(text)
const fail=(cause:unknown)=>elementPlus.ElMessage.error(cause instanceof Error?cause.message:'操作失败')
const confirm=(text:string)=>elementPlus.ElMessageBox.confirm(text,'请确认',{type:'warning'})
const session=reactive<{user:AdminInfo|null,checked:boolean,offline:boolean}>({user:null,checked:false,offline:false})
const sessionKey='travel-journal.admin-session'
function rememberSession(user:AdminInfo){localStorage.setItem(sessionKey,JSON.stringify({...user,savedAt:Date.now()}))}
function cachedSession():AdminInfo|null{try{return JSON.parse(localStorage.getItem(sessionKey)||'null') as AdminInfo|null}catch{return null}}
function forgetSession(){localStorage.removeItem(sessionKey)}
async function loadSession(){
  if(session.checked)return session.user
  if(!navigator.onLine){session.user=cachedSession();session.offline=Boolean(session.user);session.checked=true;return session.user}
  try{
    session.user=await authApi.session();session.offline=false
    if(session.user){rememberSession(session.user);try{const profile=await publicApi.profile();apply(profile.theme??session.user.themeKey)}catch{/* 主题失败不阻止后台离线进入 */};try{await ensureCsrf()}catch{/* 首次写请求会再次获取 CSRF */}}
    else forgetSession()
  }catch(cause){
    const network=cause instanceof Error&&'network' in cause&&Boolean(cause.network)
    session.user=network||!navigator.onLine?cachedSession():null;session.offline=Boolean(session.user)
    if(!session.user&&!network)forgetSession()
  }
  session.checked=true;return session.user
}
function updateUser(user:AdminInfo){session.user=user}
apply(stored())

const pages={
  Login:createLoginPage({completeSession:user=>{session.user=user;session.checked=true;session.offline=false},rememberSession,applyTheme:apply,fail}),
  Dashboard:createDashboardPage({fail}),
  Trips:createTripsPage({message,warning,fail}),
  TripWorkspace:createTripWorkspacePage({message,warning,error,info,fail,confirm}),
  Moments:createMomentsPage({session,message,warning,error,info,fail,confirm,composeConfirm:text=>elementPlus.ElMessageBox.confirm(text,'再整理一次',{confirmButtonText:'追加',cancelButtonText:'替换整篇',distinguishCancelAndClose:true,type:'info'})}),
  JournalEditor:createJournalEditorPage({message,info,warning,fail,confirm}),
  TemplateManager:createTemplateManagerPage({message,warning,fail,confirm}),
  Theme:createThemeStudioPage({session,updateUser,message,fail,confirm}),
  Profile:createProfilePage({session,updateUser,message,fail}),
  TagManager:createTagManagerPage({message,fail,confirm,warning}),
}
const routes:PublicRouteRecord[]=[
  {path:'/login',component:pages.Login,meta:{public:true,title:'登录'}},{path:'/',component:pages.Dashboard,meta:{title:'管理首页'}},
  {path:'/trips',component:pages.Trips,meta:{title:'旅行管理'}},{path:'/trips/:id',component:pages.TripWorkspace,meta:{title:'旅行工作台'}},
  {path:'/moments',component:pages.Moments,meta:{title:'随手记'}},{path:'/journals/:id',component:pages.JournalEditor,meta:{title:'编辑日记',full:true}},
  {path:'/templates',component:pages.TemplateManager,meta:{title:'日记模板'}},{path:'/tags',component:pages.TagManager,meta:{title:'标签管理'}},
  {path:'/themes',component:pages.Theme,meta:{title:'主题外观'}},{path:'/profile',component:pages.Profile,meta:{title:'个人资料'}},
]
const router=createRouter({history:createWebHashHistory(),routes})
router.beforeEach(async to=>to.meta.public||await loadSession()?true:'/login')
async function logout(){try{await authApi.logout()}catch(cause){if(!(cause instanceof Error&&'network'in cause&&cause.network))fail(cause)}finally{forgetSession();session.user=null;session.checked=true;session.offline=false;await router.replace('/login')}}
const appRoot=document.querySelector<HTMLElement>('#admin-app');if(!appRoot)throw new Error('后台缺少 #admin-app 根节点')
createApp(AdminAppShell,{session,logout}).use(router).use(elementPlus,{locale}).mount(appRoot)

installCustomCursor()
installPwa()
