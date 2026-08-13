import { defineComponent, h } from 'vue'
import MomentsPage, { type MomentsPageDeps } from '@/admin/pages/MomentsPage.vue'

export function createMomentsPage(deps: MomentsPageDeps) {
  return defineComponent({ name: 'AdminMomentsRoute', setup: () => () => h(MomentsPage, deps) })
}
