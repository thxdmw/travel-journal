import { defineComponent, h, markRaw } from 'vue'
import JournalDetailPage, { type JournalDetailPageDeps } from '@/public/pages/JournalDetailPage.vue'

type JournalDetailRouteDeps = Omit<JournalDetailPageDeps, 'preview'>

export function createJournalDetailPage(deps: JournalDetailRouteDeps) {
  const stableDeps = { ...deps, mapProviderSwitch: markRaw(deps.mapProviderSwitch) }
  return defineComponent({
    name: 'JournalDetailRoute',
    props: { preview: { type: Boolean, default: false } },
    setup: routeProps => () => h(JournalDetailPage, { ...stableDeps, preview: routeProps.preview }),
  })
}
