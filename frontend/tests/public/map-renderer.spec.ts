import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPublicMap } from '@/public/map-renderer'
import type { TravelMapInstance } from '@/types/travel-map'

const deps = vi.hoisted(() => ({
  create: vi.fn(),
  resolveProvider: vi.fn(),
  mapTokens: vi.fn(),
}))
vi.mock('@/map', () => ({ create: deps.create, resolveProvider: deps.resolveProvider }))
vi.mock('@/theme/theme', () => ({ mapTokens: deps.mapTokens }))

function mapInstance(): TravelMapInstance {
  return {
    provider: 'OSM', raw: null, destroy: vi.fn(), setCenter: vi.fn(), panTo: vi.fn(), invalidateSize: vi.fn(),
    getZoom: () => 4, zoomBy: vi.fn(), setStyle: vi.fn(), fitBounds: vi.fn(), addMarker: vi.fn(),
    setRoute: vi.fn(), removeRoute: vi.fn(), onClick: vi.fn(), onInteractionStart: vi.fn(),
  }
}

describe('公开端地图渲染器', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deps.resolveProvider.mockResolvedValue({ provider: 'OSM', source: 'auto', region: 'JP' })
    deps.mapTokens.mockReturnValue({ style: 'vintage', color: '#c96f4e', width: 4, markerStyle: 'dot', animateRoute: true })
  })

  it('过滤无效坐标并按路线选项创建标记、连线和边界', async () => {
    const map = mapInstance()
    deps.create.mockResolvedValue(map)
    const element = document.createElement('div')
    document.body.appendChild(element)
    await createPublicMap(element, [
      { cityName: '京都', countryName: '日本', latitude: 35.01, longitude: 135.76 },
      { cityName: '缺坐标', countryName: '日本', latitude: null, longitude: null },
      { cityName: '零坐标', countryName: '', latitude: 0, longitude: 0 },
      { cityName: '大阪', countryName: '日本', latitude: 34.69, longitude: 135.5 },
    ], { fit: true, route: true, maxZoom: 10 })

    expect(deps.create).toHaveBeenCalledWith(element, { provider: 'OSM', zoom: 3, style: 'vintage' })
    expect(map.addMarker).toHaveBeenCalledTimes(2)
    expect(map.setRoute).toHaveBeenCalledWith([[35.01, 135.76], [34.69, 135.5]], {
      color: '#c96f4e', width: 4, dashed: true, animate: true,
    })
    expect(map.fitBounds).toHaveBeenCalledWith([[35.01, 135.76], [34.69, 135.5]], { padding: [30, 30], maxZoom: 10 })
    map.destroy()
    element.remove()
  })

  it('Provider 创建失败时显示明确重试入口', async () => {
    deps.create.mockRejectedValue(new Error('加载失败'))
    const element = document.createElement('div')
    const result = await createPublicMap(element, [], {})
    expect(result).toBeNull()
    expect(element.classList).toContain('map-load-failed')
    expect(element.querySelector('.map-load-message p')?.textContent).toBe('OSM地图加载失败')
    expect(element.querySelector('.map-retry-btn')?.textContent).toBe('尝试高德')
  })
})
