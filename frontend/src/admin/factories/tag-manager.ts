import { defineComponent, h } from 'vue'
import TagManagerPage, { type TagManagerPageDeps } from '@/admin/pages/TagManagerPage.vue'

export function createTagManagerPage(deps: TagManagerPageDeps) {
  return defineComponent({
    name: 'AdminTagManagerRoute',
    setup: () => () => h(TagManagerPage, deps),
  })
}
