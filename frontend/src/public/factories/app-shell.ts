import { defineComponent, h } from 'vue'
import PublicAppShell, { type PublicAppShellDeps } from '@/public/components/PublicAppShell.vue'

export function createPublicAppShell(deps: PublicAppShellDeps) {
  return defineComponent({
    name: 'PublicAppShellRoute',
    setup: () => () => h(PublicAppShell, deps),
  })
}
