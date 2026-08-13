import { defineComponent, h } from 'vue'
import JournalEditorPage, { type JournalEditorPageDeps } from '@/admin/pages/JournalEditorPage.vue'

export function createJournalEditorPage(deps: JournalEditorPageDeps) {
  return defineComponent({ name: 'AdminJournalEditorRoute', setup: () => () => h(JournalEditorPage, deps) })
}
