import { flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HomePage from '@/public/pages/HomePage.vue'
import type { HomeView } from '@/types/public'
import type { TravelMapInstance } from '@/types/travel-map'

const { home } = vi.hoisted(() => ({ home: vi.fn() }))
vi.mock('@/api/public', () => ({ publicApi: { home } }))

const RouterLink = { props: ['to'], template: '<a :href="String(to)"><slot /></a>' }
const MapProviderSwitch = { emits: ['change'], template: '<button class="provider-switch" @click="$emit(\'change\')">切换</button>' }

function homeView(overrides: Partial<HomeView> = {}): HomeView {
  return {
    recentJournals: Array.from({ length: 4 }, (_, index) => ({
      id: index + 1, title: `日记 ${index + 1}`, slug: `journal-${index + 1}`, excerpt: null,
      occurredOn: '2026-04-03', tripTitle: null, tripSlug: null, cityName: '京都', coverUrl: null,
    })),
    recentTrips: [],
    cityMarkers: [{
      cityName: '京都', regionName: null, countryName: '日本', adcode: null, coordinateSystem: 'WGS84',
      latitude: 35.0116, longitude: 135.7681, firstVisitedOn: '2026-04-01', visitedYears: [2026],
      tripCount: 1, publishedJournalCount: 4, trips: [], journals: [],
    }],
    tripCount: 2, cityCount: 5, journalCount: 4, photoCount: 128,
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

describe('HomePage', () => {
  beforeEach(() => home.mockReset())

  it('渲染首页数据、最多三篇日记并创建足迹地图', async () => {
    home.mockResolvedValue(homeView())
    const createMap = vi.fn().mockResolvedValue(mapInstance())
    const wrapper = mount(HomePage, {
      props: { mapProviderSwitch: markRaw(MapProviderSwitch), createMap, destroyMap: vi.fn() },
      global: { components: { RouterLink }, stubs: { RouterLink } }, attachTo: document.body,
    })
    await flushPromises()

    expect(wrapper.findAll('.journal-card')).toHaveLength(3)
    expect(wrapper.findAll('.stat strong').map(item => item.text())).toEqual(['2', '4', '5', '128'])
    expect(createMap).toHaveBeenCalledWith(expect.any(HTMLElement), homeView().cityMarkers, true)
    wrapper.unmount()
  })

  it('Provider 切换重建地图，离开时清理容器', async () => {
    home.mockResolvedValue(homeView())
    const first = mapInstance(), second = mapInstance()
    const createMap = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const destroyMap = vi.fn()
    const wrapper = mount(HomePage, {
      props: { mapProviderSwitch: markRaw(MapProviderSwitch), createMap, destroyMap },
      global: { stubs: { RouterLink } }, attachTo: document.body,
    })
    await flushPromises()
    await wrapper.get('.provider-switch').trigger('click')
    await flushPromises()
    expect(first.destroy).toHaveBeenCalledOnce()
    wrapper.unmount()
    expect(second.destroy).toHaveBeenCalledOnce()
    expect(destroyMap).toHaveBeenCalledWith(expect.any(HTMLElement))
  })

  it('没有日记时显示首篇等待状态', async () => {
    home.mockResolvedValue(homeView({ recentJournals: [] }))
    const wrapper = mount(HomePage, {
      props: { mapProviderSwitch: markRaw(MapProviderSwitch), createMap: vi.fn().mockResolvedValue(null), destroyMap: vi.fn() },
      global: { stubs: { RouterLink } }, attachTo: document.body,
    })
    await flushPromises()
    expect(wrapper.get('.empty').text()).toBe('第一篇旅行日记，正在等待被写下。')
    wrapper.unmount()
  })
})
