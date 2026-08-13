import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminAppShell from '@/admin/AdminAppShell.vue'

const route = reactive({ fullPath: '/', meta: { title: '管理首页' } as Record<string, unknown>, params: {}, query: {} })
vi.mock('vue-router', () => ({ useRoute: () => route }))

const RouterView = { template: '<div class="route-view">页面内容</div>' }
const RouterLink = { props: ['to'], template: '<a :href="to"><slot /></a>' }
const ElButton = { emits: ['click'], template: '<button type="button" @click="$emit(\'click\')"><slot /></button>' }

function mountShell() {
  const logout = vi.fn().mockResolvedValue(undefined)
  const wrapper = mount(AdminAppShell, {
    props: {
      session: { user: { id: 1, username: 'admin', displayName: '测试站长', avatarUrl: null, themeKey: null } },
      logout,
    },
    global: { components: { RouterView, RouterLink, ElButton } },
  })
  return { wrapper, logout }
}

describe('AdminAppShell', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.classList.remove('sidebar-collapsed')
    route.fullPath = '/'
    route.meta = { title: '管理首页' }
  })

  it('渲染应用壳、页面标题与管理员会话', () => {
    const { wrapper } = mountShell()
    expect(wrapper.get('.admin-topbar h1').text()).toBe('管理首页')
    expect(wrapper.get('.sidebar-user').text()).toContain('测试站长')
    expect(wrapper.get('.sidebar-user').text()).toContain('admin')
  })

  it('持久化侧栏折叠状态并调用登出', async () => {
    const { wrapper, logout } = mountShell()
    await wrapper.get('.sidebar-collapse').trigger('click')
    expect(localStorage.getItem('travel-journal.sidebar')).toBe('collapsed')
    expect(document.body.classList.contains('sidebar-collapsed')).toBe(true)
    await wrapper.get('.top-actions button').trigger('click')
    expect(logout).toHaveBeenCalledOnce()
  })

  it('公开登录路由只显示页面内容', async () => {
    const { wrapper } = mountShell()
    route.fullPath = '/login'
    route.meta = { public: true, title: '登录' }
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.admin-shell').exists()).toBe(false)
    expect(wrapper.get('.route-view').text()).toBe('页面内容')
  })
})
