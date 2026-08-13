import { defineComponent, h } from 'vue'
import DashboardPage from '@/admin/pages/DashboardPage.vue'

export function createDashboardPage(deps: { fail(error: unknown): void }) {
  return defineComponent({
    name: 'AdminDashboardRoute',
    setup: () => () => h(DashboardPage, deps),
  })
}
