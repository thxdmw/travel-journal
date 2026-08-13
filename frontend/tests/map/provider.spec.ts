import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  manualProvider,
  providerUsable,
  resetRuntimeForTest,
  resolveProvider,
  runtime,
  setManualProvider,
} from '@/map/provider'
import { pathAtProgress } from '@/map/animate'
import type { MapRuntime } from '@/types/map'

const RUNTIME: MapRuntime = {
  region: 'CN',
  mapProvider: 'AMAP',
  amapJsKey: 'test-key',
  amapServiceHost: '/api/public/_AMapService',
  osmTileUrl: 'https://tile.test/{z}/{x}/{y}.png',
  osmAttribution: '© test',
}

function mockRuntime(overrides: Partial<MapRuntime> = {}): void {
  resetRuntimeForTest()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ json: async () => ({ data: { ...RUNTIME, ...overrides } }) }),
  )
}

beforeEach(() => {
  localStorage.clear()
  resetRuntimeForTest()
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('运行时配置', () => {
  it('同一页面只请求一次', async () => {
    mockRuntime()
    await runtime()
    await runtime()
    await runtime()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('剥掉 ApiResponse 外壳', async () => {
    mockRuntime()
    expect((await runtime()).amapJsKey).toBe('test-key')
  })

  it('没有外壳时原样使用', async () => {
    resetRuntimeForTest()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => RUNTIME }))
    expect((await runtime()).mapProvider).toBe('AMAP')
  })

  it('请求失败时给出可用的兜底，地图仍然画得出来', async () => {
    resetRuntimeForTest()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('断网')))
    const config = await runtime()
    expect(config.osmTileUrl).toContain('openstreetmap.org')
    expect(config.amapServiceHost).toBe('/api/public/_AMapService')
  })
})

describe('手动选择', () => {
  it('只接受两个合法值', () => {
    setManualProvider('AMAP')
    expect(manualProvider()).toBe('AMAP')
    setManualProvider('OSM')
    expect(manualProvider()).toBe('OSM')
  })

  it('非法值等同于清除，回到 AUTO', () => {
    setManualProvider('AMAP')
    for (const value of ['GOOGLE', '', null, undefined, 42]) {
      setManualProvider(value)
      expect(manualProvider(), String(value)).toBeNull()
    }
  })

  it('storage 里被塞了脏值时当作没选过', () => {
    localStorage.setItem('travel-map-provider', 'BAIDU')
    expect(manualProvider()).toBeNull()
  })
})

describe('可用性', () => {
  it('高德要有 JS Key', () => {
    expect(providerUsable('AMAP', RUNTIME)).toBe(true)
    expect(providerUsable('AMAP', { ...RUNTIME, amapJsKey: '' })).toBe(false)
    expect(providerUsable('AMAP', { ...RUNTIME, amapJsKey: '   ' })).toBe(false)
    expect(providerUsable('AMAP', null)).toBe(false)
  })

  it('OSM 不需要配置，永远可用', () => {
    expect(providerUsable('OSM', null)).toBe(true)
  })

  it('未知 provider 不可用', () => {
    expect(providerUsable('GOOGLE', RUNTIME)).toBe(false)
  })
})

describe('解析优先级', () => {
  it('手动选择优先于 AUTO 判定', async () => {
    // 运行时判定是 AMAP，用户选了 OSM，必须听用户的
    mockRuntime({ mapProvider: 'AMAP' })
    setManualProvider('OSM')
    const resolved = await resolveProvider()
    expect(resolved.provider).toBe('OSM')
    expect(resolved.source).toBe('manual')
  })

  it('手动选择时不去请求运行时配置', async () => {
    mockRuntime()
    setManualProvider('OSM')
    await resolveProvider()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('AUTO 跟随运行时判定', async () => {
    mockRuntime({ mapProvider: 'OSM' })
    const resolved = await resolveProvider()
    expect(resolved.provider).toBe('OSM')
    expect(resolved.source).toBe('auto')
    expect(resolved.region).toBe('CN')
  })

  it('AUTO 判定为高德但没配 Key 时退到 OSM', async () => {
    /*
     * 缺 Key 不是「高德加载失败」，而是部署时就没启用高德。AUTO 直接用 OSM，
     * 避免每个访客都看到一个注定失败的重试提示。
     */
    mockRuntime({ mapProvider: 'AMAP', amapJsKey: '' })
    expect((await resolveProvider()).provider).toBe('OSM')
  })

  it('但用户手动选了高德时仍然解析成高德，让它明确报配置错误', async () => {
    mockRuntime({ mapProvider: 'AMAP', amapJsKey: '' })
    setManualProvider('AMAP')
    expect((await resolveProvider()).provider).toBe('AMAP')
  })

  it('运行时给了未知值时按高德处理', async () => {
    mockRuntime({ mapProvider: 'WHAT' as never })
    expect((await resolveProvider()).provider).toBe('AMAP')
  })
})

describe('路线动画插值', () => {
  const points: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
  ]

  it('起点只画第一个点', () => {
    expect(pathAtProgress(points, 0)).toEqual([[0, 0]])
  })

  it('终点画完整条', () => {
    expect(pathAtProgress(points, 1)).toEqual(points)
  })

  it('中途补出半截线段', () => {
    // 进度 0.25 落在第一段的中点
    const path = pathAtProgress(points, 0.25)
    expect(path).toHaveLength(2)
    expect(path[1]).toEqual([5, 0])
  })

  it('进度越界时夹住，不会画出多余的点', () => {
    expect(pathAtProgress(points, -1)).toEqual([[0, 0]])
    expect(pathAtProgress(points, 2)).toEqual(points)
  })

  it('空路径不报错', () => {
    expect(pathAtProgress([], 0.5)).toEqual([])
  })
})
