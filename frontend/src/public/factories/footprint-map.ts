import { defineComponent, h, markRaw } from 'vue'
import FootprintMapPage, { type FootprintMapPageDeps } from '@/public/pages/FootprintMapPage.vue'

export function createFootprintMapPage(deps: FootprintMapPageDeps) {
  const stableDeps = { ...deps, mapProviderSwitch: markRaw(deps.mapProviderSwitch) }
  return defineComponent({
    name: 'FootprintMapRoute',
    setup: () => () => h(FootprintMapPage, stableDeps),
  })
}
