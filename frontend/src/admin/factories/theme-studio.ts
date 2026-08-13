import { defineComponent, h } from 'vue'
import ThemeStudioPage, { type ThemeStudioPageDeps } from '@/admin/pages/ThemeStudioPage.vue'

export function createThemeStudioPage(deps: ThemeStudioPageDeps) {
  return defineComponent({ name: 'AdminThemeStudioRoute', setup: () => () => h(ThemeStudioPage, deps) })
}
