/* 管理后台多页入口；顺序与迁移前 admin/index.html 严格一致。 */
import '@/legacy/travel-theme-global'
import '@/legacy/theme-effects-global'
import '@/legacy/travel-api-global'
import '@/legacy/travel-map-global'
import '@/legacy/local-draft-global'
import '@/legacy/journal-media-global'
import '@/legacy/journal-blocks-global'
import '@/legacy/day-route-global'
import '../../../src/main/resources/static/js/common/journal-block-editor.js'
import '@/admin/register-pages'
import { createApp, type Component, type Plugin } from 'vue'
import { authApi } from '@/api/auth'
import AdminAppShell from '@/admin/AdminAppShell.vue'
import { createRouter, createWebHashHistory, type PublicRouteRecord } from '@/vendor/vue-router-global'
import type { AdminInfo } from '@/types/auth'

import '../../../src/main/resources/static/js/admin/shared.js'
import '../../../src/main/resources/static/js/admin/trip-workspace.js'
import '../../../src/main/resources/static/js/admin/journal-editor.js'
import '../../../src/main/resources/static/js/admin/moments.js'
import '../../../src/main/resources/static/js/admin/studio.js'
import '../../../src/main/resources/static/js/common/custom-cursor.js'
import '../../../src/main/resources/static/js/common/pwa.js'

interface AdminSharedBridge {
  session: { user: AdminInfo | null, checked: boolean, offline: boolean }
  loadSession(): Promise<AdminInfo | null>
  fail(error: unknown): void
  forgetSession(): void
}

interface AdminPagesBridge {
  Login: Component
  Dashboard: Component
  Trips: Component
  TripWorkspace: Component
  JournalEditor: Component
  TemplateManager: Component
  Theme: Component
  Profile: Component
  TagManager: Component
  Moments: Component
}

const shared = (window as typeof window & { AdminShared: AdminSharedBridge }).AdminShared
const pages = (window as typeof window & { AdminPages: AdminPagesBridge }).AdminPages
const routes: PublicRouteRecord[] = [
  { path: '/login', component: pages.Login, meta: { public: true, title: '登录' } },
  { path: '/', component: pages.Dashboard, meta: { title: '管理首页' } },
  { path: '/trips', component: pages.Trips, meta: { title: '旅行管理' } },
  { path: '/trips/:id', component: pages.TripWorkspace, meta: { title: '旅行工作台' } },
  { path: '/moments', component: pages.Moments, meta: { title: '随手记' } },
  { path: '/journals/:id', component: pages.JournalEditor, meta: { title: '编辑日记', full: true } },
  { path: '/templates', component: pages.TemplateManager, meta: { title: '日记模板' } },
  { path: '/tags', component: pages.TagManager, meta: { title: '标签管理' } },
  { path: '/themes', component: pages.Theme, meta: { title: '主题外观' } },
  { path: '/profile', component: pages.Profile, meta: { title: '个人资料' } },
]
const router = createRouter({ history: createWebHashHistory(), routes })
router.beforeEach(async to => to.meta.public || await shared.loadSession() ? true : '/login')

async function logout() {
  try {
    await authApi.logout()
  } catch (error) {
    if (!(error instanceof Error && 'network' in error && error.network)) shared.fail(error)
  } finally {
    shared.forgetSession()
    shared.session.user = null
    shared.session.checked = true
    shared.session.offline = false
    await router.replace('/login')
  }
}

const appRoot = document.querySelector<HTMLElement>('#admin-app')
if (!appRoot) throw new Error('后台缺少 #admin-app 根节点')
const elementPlus = (window as typeof window & { ElementPlus: Plugin<[{ locale: unknown }]> }).ElementPlus
const locale = (window as typeof window & { ElementPlusLocaleZhCn: unknown }).ElementPlusLocaleZhCn
createApp(AdminAppShell, { session: shared.session, logout }).use(router).use(elementPlus, { locale }).mount(appRoot)
