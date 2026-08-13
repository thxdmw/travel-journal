import { defineComponent, h } from 'vue'
import ThemePreviewScene, { type ThemePreviewSceneDeps } from '@/public/pages/ThemePreviewScene.vue'

export function createThemePreviewScene(deps: ThemePreviewSceneDeps) {
  return defineComponent({
    name: 'ThemePreviewRoute',
    setup: () => () => h(ThemePreviewScene, deps),
  })
}
