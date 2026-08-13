import { defineComponent, h, markRaw } from 'vue'
import HomePage, { type HomePageDeps } from '@/public/pages/HomePage.vue'

export function createHomePage(deps: HomePageDeps) {
  const stableDeps = { ...deps, mapProviderSwitch: markRaw(deps.mapProviderSwitch) }
  return defineComponent({
    name: 'HomeRoute',
    setup: () => () => h(HomePage, stableDeps),
  })
}
