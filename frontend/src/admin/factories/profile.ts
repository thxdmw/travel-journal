import { defineComponent, h } from 'vue'
import ProfilePage, { type ProfilePageDeps } from '@/admin/pages/ProfilePage.vue'

export function createProfilePage(deps: ProfilePageDeps) {
  return defineComponent({
    name: 'AdminProfileRoute',
    setup: () => () => h(ProfilePage, deps),
  })
}
