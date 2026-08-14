import { defineComponent, h } from 'vue'
import JournalManagerPage, { type JournalManagerPageDeps } from '@/admin/pages/JournalManagerPage.vue'

export function createJournalManagerPage(deps: JournalManagerPageDeps) {
  return defineComponent({ name: 'AdminJournalManagerRoute', setup: () => () => h(JournalManagerPage, deps) })
}
