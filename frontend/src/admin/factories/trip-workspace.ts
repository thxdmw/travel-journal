import { defineComponent, h } from 'vue'
import TripWorkspacePage, { type TripWorkspacePageDeps } from '@/admin/pages/TripWorkspacePage.vue'

export function createTripWorkspacePage(deps: TripWorkspacePageDeps) {
  return defineComponent({
    name: 'AdminTripWorkspaceRoute',
    setup: () => () => h(TripWorkspacePage, deps),
  })
}
