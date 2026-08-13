import { defineComponent, h } from 'vue'
import TemplateManagerPage, { type TemplateManagerPageDeps } from '@/admin/pages/TemplateManagerPage.vue'

export function createTemplateManagerPage(deps: TemplateManagerPageDeps) {
  return defineComponent({ name: 'AdminTemplateManagerRoute', setup: () => () => h(TemplateManagerPage, deps) })
}
