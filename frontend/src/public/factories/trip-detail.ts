import { defineComponent, h, markRaw } from 'vue'
import TripDetailPage, { type TripDetailPageDeps } from '@/public/pages/TripDetailPage.vue'

/** 把旧入口已验证的地图/主题边界注入 SFC，迁移期不复制实现。 */
export function createTripDetailPage(deps: TripDetailPageDeps) {
  const stableDeps = { ...deps, mapProviderSwitch: markRaw(deps.mapProviderSwitch) }
  return defineComponent({
    name: 'TripDetailRoute',
    setup: () => () => h(TripDetailPage, stableDeps),
  })
}
