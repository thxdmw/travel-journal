/*
 * 公开站正式 ESM 入口：页面与运行时全部直接使用 TypeScript 模块。
 *
 * 这里刻意没有 Element Plus：公开端一个 el-* 组件都没用，但只要引一行它的 CSS，
 * 打包器就会把整个库归进公开端的 chunk 图——首页因此白白多下 873KB JS 和 341KB CSS。
 * 后台仍然照常使用，那是 admin.ts 的事。
 */
import 'leaflet/dist/leaflet.css'
import '@/styles/themes/base.css'
import '@/styles/public.css'
import '@/styles/travel-map.css'
import '@/styles/theme-tokens.css'
import '@/styles/theme-pack.css'
import '@/styles/journal-media.css'
import '@/styles/journal-blocks.css'
import '@/styles/custom-cursor.css'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { destroy as destroyMap, create as createMap } from '@/map'
import { apply, mapTokens, stored } from '@/theme/theme'
import { DEFAULT_BASE } from '@/theme/tokens'
import MapProviderSwitch from '@/public/components/MapProviderSwitch.vue'
import JournalCard from '@/public/components/JournalCard.vue'
import JournalsPage from '@/public/pages/JournalsPage.vue'
import TripsPage from '@/public/pages/TripsPage.vue'
import YearReviewPage from '@/public/pages/YearReviewPage.vue'
import { createFootprintMapPage } from '@/public/factories/footprint-map'
import { createHomePage } from '@/public/factories/home'
import { createJournalDetailPage } from '@/public/factories/journal-detail'
import { createPublicAppShell } from '@/public/factories/app-shell'
import { createThemePreviewScene } from '@/public/factories/theme-preview'
import { createTripDetailPage } from '@/public/factories/trip-detail'
import { createPublicMap } from '@/public/map-renderer'
import type { ThemeInput } from '@/types/theme'
import { installCustomCursor } from '@/enhancements/custom-cursor'
import { installPwa } from '@/enhancements/pwa'
import { install as installThemeEffects } from '@/effects/runtime'
import { current } from '@/theme/theme'

const appRoot = document.querySelector<HTMLElement>('#app')
if (!appRoot) throw new Error('公开站缺少 #app 根节点')

const isThemePreview = new URLSearchParams(location.search).has('theme-preview')
// 主题预览页从裸底座起步，预览的主题随后由父窗口用 postMessage 送进来
let siteTheme: ThemeInput = isThemePreview ? DEFAULT_BASE : stored()
let scopedTheme: ThemeInput = null

function setSiteTheme(theme: ThemeInput) {
  siteTheme = theme
  if (!scopedTheme) apply(theme)
}

function setScopedTheme(theme: ThemeInput) {
  scopedTheme = theme
  apply(theme)
}

function clearScopedTheme() {
  scopedTheme = null
  apply(siteTheme)
}

apply(siteTheme)
installThemeEffects({ currentDefinition: () => current()?.definitionJson })

const sharedMapDeps = {
  mapProviderSwitch: MapProviderSwitch,
  createMap: createPublicMap,
  destroyMap,
}
const Home = createHomePage(sharedMapDeps)
const FootprintMap = createFootprintMapPage(sharedMapDeps)
const TripDetail = createTripDetailPage({ ...sharedMapDeps, setScopedTheme, clearScopedTheme })
const JournalDetail = createJournalDetailPage({ ...sharedMapDeps, setScopedTheme, clearScopedTheme })
const ThemePreviewScene = createThemePreviewScene({
  createMap: (element, options) => createMap(element, options),
  destroyMap,
  mapTokens,
})

const routes: RouteRecordRaw[] = isThemePreview
  ? [{ path: '/:pathMatch(.*)*', component: ThemePreviewScene }]
  : [
      { path: '/', component: Home },
      { path: '/trips', component: TripsPage },
      { path: '/trips/:slug', component: TripDetail },
      { path: '/journals', component: JournalsPage },
      { path: '/journals/:slug', component: JournalDetail },
      { path: '/preview/:token', component: JournalDetail, props: { preview: true } },
      /*
       * 「年度回顾」用一条可选参数的路由，不拆成两条。
       *
       * 页面一挂载就会 replace 到 /years/<最近一年>。拆成两条记录时那是一次跨记录跳转，
       * 组件会被销毁重建，刚拉回来的年份列表白拉一遍；合成一条则是同一条记录内的参数
       * 变化，组件复用，由页面里 watch route.params.year 接着加载。
       *
       * 注意这条路由和导航高亮无关：高亮由 PublicAppShell 自己按路径前缀判断，
       * router-link 自带的 router-link-active 在这里靠不住，原因见那边的注释。
       */
      { path: '/years/:year?', component: YearReviewPage },
      { path: '/map', component: FootprintMap },
    ]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})
const App = createPublicAppShell({
  isThemePreview,
  currentPath: () => router.currentRoute.value.fullPath,
  setSiteTheme,
  applyTheme: apply,
})

createApp(App).use(router).component('JournalCard', JournalCard).mount(appRoot)

installCustomCursor()
installPwa()
