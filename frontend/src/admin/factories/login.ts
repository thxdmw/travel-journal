import { defineComponent, h } from 'vue'
import LoginPage, { type LoginPageDeps } from '@/admin/pages/LoginPage.vue'

export function createLoginPage(deps: LoginPageDeps) {
  return defineComponent({
    name: 'AdminLoginRoute',
    setup: () => () => h(LoginPage, deps),
  })
}
