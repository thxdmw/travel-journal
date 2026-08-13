/* 公开站正式 ESM 入口：页面与运行时全部直接使用 TypeScript 模块。 */
import 'element-plus/dist/index.css'
import 'leaflet/dist/leaflet.css'
import '@/styles/themes/travel-classic.css'
import '@/styles/public.css'
import '@/styles/theme-tokens.css'
import '@/styles/theme-pack.css'
import '@/styles/journal-media.css'
import '@/styles/journal-blocks.css'
import '@/styles/custom-cursor.css'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { destroy as destroyMap, create as createMap } from '@/map'
import { apply, mapTokens, stored } from '@/theme/theme'
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
let siteTheme: ThemeInput = isThemePreview ? 'travel-classic' : stored()
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
      { path: '/years', component: YearReviewPage },
      { path: '/years/:year', component: YearReviewPage },
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
