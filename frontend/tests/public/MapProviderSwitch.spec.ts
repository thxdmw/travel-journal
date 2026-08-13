import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MapProviderSwitch from '@/public/components/MapProviderSwitch.vue'

const provider = vi.hoisted(() => ({
  manualProvider: vi.fn(),
  providerUsable: vi.fn(),
  resolveProvider: vi.fn(),
  runtime: vi.fn(),
  setManualProvider: vi.fn(),
}))
vi.mock('@/map/provider', () => provider)

describe('MapProviderSwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    provider.manualProvider.mockReturnValue(null)
    provider.runtime.mockResolvedValue({ amapJsKey: 'test-key' })
    provider.providerUsable.mockReturnValue(true)
    provider.resolveProvider.mockResolvedValue({ provider: 'AMAP', source: 'auto', region: 'CN' })
  })

  it('AUTO 显示实际解析的 Provider', async () => {
    const wrapper = mount(MapProviderSwitch)
    await flushPromises()
    expect(wrapper.get('button:nth-child(1)').text()).toBe('自动（高德）')
    expect(wrapper.get('button:nth-child(1)').classes()).toContain('active')
  })

  it('手动切换 Provider 后持久化并通知宿主重建地图', async () => {
    const wrapper = mount(MapProviderSwitch)
    await flushPromises()
    await wrapper.get('button:nth-child(3)').trigger('click')
    expect(provider.setManualProvider).toHaveBeenCalledWith('OSM')
    expect(wrapper.emitted('change')).toHaveLength(1)
    expect(wrapper.get('button:nth-child(3)').classes()).toContain('active')
  })

  it('从手动选择切回 AUTO 后重新解析并清除持久化值', async () => {
    provider.manualProvider.mockReturnValue('OSM')
    const wrapper = mount(MapProviderSwitch)
    await flushPromises()
    expect(provider.resolveProvider).not.toHaveBeenCalled()
    await wrapper.get('button:nth-child(1)').trigger('click')
    await flushPromises()
    expect(provider.setManualProvider).toHaveBeenCalledWith(null)
    expect(provider.resolveProvider).toHaveBeenCalledOnce()
    expect(wrapper.get('button:nth-child(1)').text()).toBe('自动（高德）')
  })

  it('未配置高德 Key 时禁用高德按钮', async () => {
    provider.providerUsable.mockReturnValue(false)
    const wrapper = mount(MapProviderSwitch)
    await flushPromises()
    const amap = wrapper.get('button:nth-child(2)')
    expect(amap.attributes('disabled')).toBeDefined()
    expect(amap.attributes('title')).toContain('未配置高德')
    await amap.trigger('click')
    expect(provider.setManualProvider).not.toHaveBeenCalled()
  })
})
