import { defineComponent, h } from 'vue'
import TripsPage, { type TripsPageDeps } from '@/admin/pages/TripsPage.vue'

export function createTripsPage(deps: TripsPageDeps) {
  return defineComponent({
    name: 'AdminTripsRoute',
    setup: () => () => h(TripsPage, deps),
  })
}
