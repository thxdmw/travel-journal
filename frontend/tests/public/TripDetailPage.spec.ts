import { flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TripDetailPage from '@/public/pages/TripDetailPage.vue'
import type { TripDetail } from '@/types/public'
import type { TravelMapInstance } from '@/types/travel-map'

const mocks = vi.hoisted(() => ({
  trip: vi.fn(),
  route: { params: { slug: 'kyoto' } },
}))

vi.mock('@/api/public', () => ({
  publicApi: { trip: mocks.trip },
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
}))

const RouterLink = {
  props: ['to'],
  template: '<a :href="String(to)"><slot /></a>',
}

const MapProviderSwitch = {
  emits: ['change'],
  template: '<button class="provider-switch" @click="$emit(\'change\')">切换</button>',
}

function detail(): TripDetail {
  return {
    trip: {
      id: 1,
      title: '京都之旅',
      slug: 'kyoto',
      summary: '沿着鸭川慢慢走',
      status: 'COMPLETED',
      startDate: '2026-04-01',
      endDate: '2026-04-05',
      cities: ['京都', '宇治'],
      journalCount: 1,
      coverUrl: null,
    },
    stops: [{
      cityName: '京都', regionName: null, countryName: '日本', latitude: 35.0116, longitude: 135.7681,
      formattedAddress: null, adcode: null, coordinateSystem: 'WGS84', arrivalDate: '2026-04-01', departureDate: '2026-04-05', sortOrder: 1,
    }],
    journals: [{
      id: 2, title: '京都的第三个清晨', slug: 'morning', excerpt: '鸭川边的风', occurredOn: '2026-04-03',
      tripTitle: '京都之旅', tripSlug: 'kyoto', cityName: '京都', coverUrl: null,
    }],
    theme: null,
  }
}

function mapInstance() {
  const instance: TravelMapInstance = {
    provider: 'OSM', raw: null, destroy: vi.fn(), setCenter: vi.fn(), panTo: vi.fn(), invalidateSize: vi.fn(),
    getZoom: () => 8, zoomBy: vi.fn(), setStyle: vi.fn(), fitBounds: vi.fn(), addMarker: vi.fn(),
    setRoute: vi.fn(), removeRoute: vi.fn(), onClick: vi.fn(), onInteractionStart: vi.fn(),
  }
  return instance
}

describe('TripDetailPage', () => {
  beforeEach(() => mocks.trip.mockReset())

  it('加载详情、渲染时间线并创建路线地图', async () => {
    mocks.trip.mockResolvedValue(detail())
    const map = mapInstance()
    const createMap = vi.fn().mockResolvedValue(map)
    const setScopedTheme = vi.fn()
    const wrapper = mount(TripDetailPage, {
      props: { mapProviderSwitch: markRaw(MapProviderSwitch), createMap, destroyMap: vi.fn(), setScopedTheme, clearScopedTheme: vi.fn() },
      global: { components: { RouterLink }, stubs: { RouterLink } },
      attachTo: document.body,
    })
    await flushPromises()

    expect(mocks.trip).toHaveBeenCalledWith('kyoto')
    expect(setScopedTheme).toHaveBeenCalledWith(null)
    expect(createMap).toHaveBeenCalledWith(expect.any(HTMLElement), detail().stops, { fit: true, route: true, maxZoom: 10 })
    expect(wrapper.text()).toContain('京都之旅')
    expect(wrapper.get('a[href="/journals/morning"]')).toBeTruthy()
    wrapper.unmount()
  })

  it('Provider 切换重建地图，离开页面时清理地图与主题', async () => {
    mocks.trip.mockResolvedValue(detail())
    const first = mapInstance()
    const second = mapInstance()
    const createMap = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const destroyMap = vi.fn()
    const clearScopedTheme = vi.fn()
    const wrapper = mount(TripDetailPage, {
      props: { mapProviderSwitch: markRaw(MapProviderSwitch), createMap, destroyMap, setScopedTheme: vi.fn(), clearScopedTheme },
      global: { stubs: { RouterLink } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('.provider-switch').trigger('click')
    await flushPromises()
    expect(first.destroy).toHaveBeenCalledOnce()
    expect(createMap).toHaveBeenCalledTimes(2)

    wrapper.unmount()
    expect(second.destroy).toHaveBeenCalledOnce()
    expect(destroyMap).toHaveBeenCalledWith(expect.any(HTMLElement))
    expect(clearScopedTheme).toHaveBeenCalledOnce()
  })
})
