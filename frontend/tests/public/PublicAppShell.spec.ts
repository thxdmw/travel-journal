import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PublicAppShell from '@/public/components/PublicAppShell.vue'

const { profile } = vi.hoisted(() => ({ profile: vi.fn() }))
vi.mock('@/api/public', () => ({ publicApi: { profile } }))

const RouterLink = { props: ['to'], template: '<a :href="String(to)"><slot /></a>' }
const RouterView = { template: '<main class="route-content">内容</main>' }

function mountShell(overrides: Partial<InstanceType<typeof PublicAppShell>['$props']> = {}) {
  const setSiteTheme = vi.fn()
  const applyTheme = vi.fn()
  const currentPath = vi.fn(() => '/')
  const wrapper = mount(PublicAppShell, {
    props: { isThemePreview: false, currentPath, setSiteTheme, applyTheme, ...overrides },
    global: { stubs: { RouterLink, RouterView } },
    attachTo: document.body,
  })
  return { wrapper, setSiteTheme, applyTheme, currentPath }
}

describe('PublicAppShell', () => {
  beforeEach(() => {
    profile.mockReset()
    profile.mockResolvedValue({ displayName: '小旅', avatarUrl: '/avatar.jpg', themeKey: 'travel-classic', theme: null })
  })

  it('加载公开资料并应用站点主题', async () => {
    const { wrapper, setSiteTheme } = mountShell()
    await flushPromises()
    expect(wrapper.get('.admin-link').attributes('title')).toBe('小旅 · 管理后台')
    expect(wrapper.get('.admin-link img').attributes('src')).toBe('/avatar.jpg')
    expect(setSiteTheme).toHaveBeenCalledWith('travel-classic')
    wrapper.unmount()
  })

  it('移动菜单可打开，并可通过外部点击和 Escape 关闭', async () => {
    const { wrapper } = mountShell()
    await flushPromises()
    const button = wrapper.get('.mobile-menu')
    await button.trigger('click')
    expect(wrapper.get('.public-nav').classes()).toContain('open')
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.public-nav').classes()).not.toContain('open')
    await button.trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.public-nav').classes()).not.toContain('open')
    wrapper.unmount()
  })

  it('仅接收同源主题预览消息', async () => {
    const { wrapper, applyTheme } = mountShell()
    await flushPromises()
    window.dispatchEvent(new MessageEvent('message', { origin: location.origin, data: { type: 'travel-theme-preview', theme: 'paper' } }))
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://example.com', data: { type: 'travel-theme-preview', theme: 'evil' } }))
    expect(applyTheme).toHaveBeenCalledOnce()
    expect(applyTheme).toHaveBeenCalledWith('paper', { persist: false })
    wrapper.unmount()
  })

  it('主题预览模式使用固定导航且不请求公开资料', async () => {
    const { wrapper } = mountShell({ isThemePreview: true })
    await flushPromises()
    expect(profile).not.toHaveBeenCalled()
    expect(wrapper.get('.theme-preview-fixed-badge').text()).toContain('不读取站点内容')
    expect(wrapper.find('.mobile-menu').exists()).toBe(false)
    wrapper.unmount()
  })
})
