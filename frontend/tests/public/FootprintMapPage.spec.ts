import { flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FootprintMapPage from '@/public/pages/FootprintMapPage.vue'
import type { CityMarker } from '@/types/public'
import type { TravelMapInstance } from '@/types/travel-map'

const { cities } = vi.hoisted(() => ({ cities: vi.fn() }))
vi.mock('@/api/public', () => ({ publicApi: { cities } }))

const MapProviderSwitch = { emits: ['change'], template: '<button class="provider-switch" @click="$emit(\'change\')">切换</button>' }

function city(overrides: Partial<CityMarker> = {}): CityMarker {
  return {
    cityName: '京都', regionName: null, countryName: '日本', adcode: null, coordinateSystem: 'WGS84',
    latitude: 35.0116, longitude: 135.7681, firstVisitedOn: '2026-04-01', visitedYears: [2026],
    tripCount: 1, publishedJournalCount: 2,
    trips: [{ title: '关西春日', slug: 'kansai' }], journals: [],
    ...overrides,
  }
}

function mapInstance(): TravelMapInstance {
  return {
    provider: 'OSM', raw: null, destroy: vi.fn(), setCenter: vi.fn(), panTo: vi.fn(), invalidateSize: vi.fn(),
    getZoom: () => 4, zoomBy: vi.fn(), setStyle: vi.fn(), fitBounds: vi.fn(), addMarker: vi.fn(),
    setRoute: vi.fn(), removeRoute: vi.fn(), onClick: vi.fn(), onInteractionStart: vi.fn(),
  }
}

function mountPage(createMap = vi.fn().mockResolvedValue(mapInstance()), destroyMap = vi.fn()) {
  return {
    wrapper: mount(FootprintMapPage, {
      props: { mapProviderSwitch: markRaw(MapProviderSwitch), createMap, destroyMap },
      attachTo: document.body,
    }),
    createMap,
    destroyMap,
  }
}

describe('FootprintMapPage', () => {
  beforeEach(() => cities.mockReset())

  it('加载全部足迹并构建国家、年份和旅行筛选项', async () => {
    const markers = [
      city(),
      city({ cityName: '东京', visitedYears: [2024], trips: [{ title: '东京周末', slug: 'tokyo' }] }),
      city({ cityName: '巴黎', countryName: '法国', visitedYears: [2025], trips: [{ title: '法兰西', slug: 'france' }] }),
    ]
    cities.mockResolvedValue(markers)
    const { wrapper, createMap } = mountPage()
    await flushPromises()

    expect(wrapper.findAll('.journal-card')).toHaveLength(3)
    expect(wrapper.get('[aria-label="按国家筛选"]').findAll('option').map(item => item.text())).toEqual(['全部国家', '日本', '法国'])
    expect(wrapper.get('[aria-label="按年份筛选"]').findAll('option').map(item => item.text())).toEqual(['全部年份', '2026 年', '2025 年', '2024 年'])
    expect(createMap).toHaveBeenCalledWith(expect.any(HTMLElement), markers, { fit: true, maxZoom: 7 })
    wrapper.unmount()
  })

  it('组合筛选同步更新地点卡片和地图标记', async () => {
    cities.mockResolvedValue([
      city(),
      city({ cityName: '东京', publishedJournalCount: 0, trips: [{ title: '东京周末', slug: 'tokyo' }] }),
      city({ cityName: '巴黎', countryName: '法国', visitedYears: [2025], trips: [{ title: '法兰西', slug: 'france' }] }),
    ])
    const { wrapper, createMap } = mountPage()
    await flushPromises()
    await wrapper.get('[aria-label="按国家筛选"]').setValue('日本')
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await flushPromises()

    expect(wrapper.findAll('.journal-card')).toHaveLength(1)
    expect(wrapper.get('.journal-card h3').text()).toContain('京都')
    expect(createMap).toHaveBeenLastCalledWith(expect.any(HTMLElement), [expect.objectContaining({ cityName: '京都' })], { fit: true, maxZoom: 7 })
    wrapper.unmount()
  })

  it('Provider 切换重建地图并在离页时清理容器', async () => {
    cities.mockResolvedValue([city()])
    const first = mapInstance(), second = mapInstance()
    const createMap = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const destroyMap = vi.fn()
    const { wrapper } = mountPage(createMap, destroyMap)
    await flushPromises()
    await wrapper.get('.provider-switch').trigger('click')
    await flushPromises()
    expect(first.destroy).toHaveBeenCalledOnce()
    wrapper.unmount()
    expect(second.destroy).toHaveBeenCalledOnce()
    expect(destroyMap).toHaveBeenCalledWith(expect.any(HTMLElement))
  })

  it('没有符合筛选条件的城市时显示空状态', async () => {
    cities.mockResolvedValue([city({ publishedJournalCount: 0 })])
    const { wrapper } = mountPage()
    await flushPromises()
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await flushPromises()
    expect(wrapper.get('.empty').text()).toBe('当前筛选条件下没有足迹。')
    wrapper.unmount()
  })
})
