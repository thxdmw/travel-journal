/*
 * 公开站多页入口。
 *
 * 这里的顺序就是迁移前 index.html 的脚本顺序。兼容层先建立 window.* 契约，
 * 页面 IIFE 再创建 Vue 应用；后续迁 SFC 时从本文件逐个替换即可。
 */
import '@/legacy/travel-theme-global'
import '@/legacy/theme-effects-global'
import '@/legacy/travel-api-global'
import '@/legacy/travel-map-global'
import '@/legacy/journal-media-global'
import '@/legacy/journal-blocks-global'
import '@/legacy/day-route-global'
import JournalCard from '@/public/components/JournalCard.vue'
import MapProviderSwitch from '@/public/components/MapProviderSwitch.vue'
import JournalsPage from '@/public/pages/JournalsPage.vue'
import TripsPage from '@/public/pages/TripsPage.vue'
import YearReviewPage from '@/public/pages/YearReviewPage.vue'
import { createTripDetailPage } from '@/public/factories/trip-detail'
import { createHomePage } from '@/public/factories/home'
import { createFootprintMapPage } from '@/public/factories/footprint-map'
import { createJournalDetailPage } from '@/public/factories/journal-detail'
import { createPublicAppShell } from '@/public/factories/app-shell'
import { createThemePreviewScene } from '@/public/factories/theme-preview'

const appRoot = document.querySelector<HTMLElement>('#app')
if (!appRoot) throw new Error('公开站缺少 #app 根节点')

const pagesKey = Symbol.for('travel-journal.public-pages')
Object.defineProperty(appRoot, pagesKey, {
  configurable: false,
  enumerable: false,
  value: Object.freeze({
    JournalCard,
    MapProviderSwitch,
    Journals: JournalsPage,
    Trips: TripsPage,
    YearReview: YearReviewPage,
    createFootprintMapPage,
    createHomePage,
    createJournalDetailPage,
    createPublicAppShell,
    createThemePreviewScene,
    createTripDetailPage,
  }),
})

async function bootstrap() {
  await import('../../../src/main/resources/static/js/public-app.js')
  await import('../../../src/main/resources/static/js/common/custom-cursor.js')
  await import('../../../src/main/resources/static/js/common/pwa.js')
}

void bootstrap()
