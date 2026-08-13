import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create, destroy } from '@/map'
import { resetRuntimeForTest } from '@/map/provider'
import type { TravelMapInstance } from '@/types/travel-map'

/*
 * 容器生命周期。
 *
 * Provider 解析和 SDK 加载都是异步的，用户快速切页或反复切换 Provider 时，
 * 两次 create() 会重叠——Leaflet 会抛「Map container already initialized」，
 * 或者在已经卸载的 DOM 上留下一张跑着瓦片请求的地图。
 *
 * 这里用一个可控时序的假 Leaflet 来构造这些竞态。
 */

/** 每次建图记一笔，用来断言创建与销毁的配对。 */
const created: { destroyed: boolean }[] = []

/** 建图前要等的闸门，测试用它精确控制时序。 */
let gate: Promise<void> = Promise.resolve()

function fakeLeaflet(): void {
  const noop = () => undefined
  vi.stubGlobal('L', {
    map: () => {
      const record = { destroyed: false }
      created.push(record)
      const instance = {
        setView: () => instance,
        panTo: noop,
        invalidateSize: noop,
        getZoom: () => 4,
        setZoom: noop,
        fitBounds: noop,
        removeLayer: noop,
        remove: () => {
          record.destroyed = true
        },
        on: noop,
      }
      return instance
    },
    tileLayer: () => ({ addTo: noop }),
    marker: () => ({ addTo: () => ({}) }),
    polyline: () => ({ addTo: () => ({}) }),
    divIcon: () => ({}),
  })
}

beforeEach(() => {
  created.length = 0
  gate = Promise.resolve()
  localStorage.clear()
  resetRuntimeForTest()
  fakeLeaflet()
  // 运行时解析到 OSM，避免碰高德 SDK 的动态加载
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => {
      await gate
      return { json: async () => ({ data: { mapProvider: 'OSM', osmTileUrl: 'https://t/{z}/{x}/{y}.png' } }) }
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

const container = () => document.createElement('div')

describe('基本生命周期', () => {
  it('建出一个 OSM 实例', async () => {
    const map = await create(container())
    expect(map?.provider).toBe('OSM')
    expect(created).toHaveLength(1)
  })

  it('没有容器时明确报错', async () => {
    await expect(create(null)).rejects.toThrow('缺少地图容器')
  })

  it('destroy 释放底层实例', async () => {
    const element = container()
    await create(element)
    destroy(element)
    expect(created[0]?.destroyed).toBe(true)
  })

  it('重复 destroy 是空操作', async () => {
    const element = container()
    const map = await create(element)
    destroy(element)
    map?.destroy()
    map?.destroy()
    // 只销毁了一次，没有对同一个实例反复调 remove
    expect(created.filter(item => item.destroyed)).toHaveLength(1)
  })

  it('对没建过图的容器 destroy 不报错', () => {
    expect(() => destroy(container())).not.toThrow()
  })
})

describe('同容器串行', () => {
  it('连续两次 create 不会让两张地图同时活着', async () => {
    const element = container()
    const [first, second] = await Promise.all([create(element), create(element)])

    expect(created).toHaveLength(2)
    // 第一张必须在第二张建起来时被销毁，否则 Leaflet 会抛容器已初始化
    expect(created[0]?.destroyed).toBe(true)
    expect(first).not.toBe(second)
    expect(second?.provider).toBe('OSM')
  })

  it('三次并发也只留最后一张', async () => {
    const element = container()
    await Promise.all([create(element), create(element), create(element)])
    const alive = created.filter(item => !item.destroyed)
    expect(alive).toHaveLength(1)
  })

  it('不同容器互不影响', async () => {
    const [a, b] = [container(), container()]
    await Promise.all([create(a), create(b)])
    expect(created.filter(item => item.destroyed)).toHaveLength(0)
  })

  it('前一次失败不会卡住后一次', async () => {
    const element = container()
    // 让第一次解析失败
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('炸了')))
    vi.stubGlobal('L', undefined)
    await create(element).catch(() => undefined)

    fakeLeaflet()
    const second = await create(element)
    expect(second?.provider).toBe('OSM')
  })
})

describe('建图期间容器被卸载', () => {
  it('排队期间被 destroy，不再建图', async () => {
    const element = container()
    let openGate: () => void = () => undefined
    gate = new Promise<void>(resolve => {
      openGate = resolve
    })

    const pending = create(element)
    // 还卡在运行时请求上时，页面把容器卸载了
    destroy(element)
    openGate()

    await expect(pending).resolves.toBeNull()
    expect(created).toHaveLength(0)
  })

  it('实例刚建出来就被 destroy 时立即释放，不留监听和瓦片请求', async () => {
    const element = container()
    let openGate: () => void = () => undefined
    gate = new Promise<void>(resolve => {
      openGate = resolve
    })

    const pending = create(element)
    destroy(element)
    openGate()
    await pending

    // 无论有没有真的建出来，都不能留下一张活着的地图
    expect(created.filter(item => !item.destroyed)).toHaveLength(0)
  })
})

describe('显式指定 Provider', () => {
  it('跳过解析，直接用指定的那个', async () => {
    // 用于失败后「换一个试试」的重试路径
    localStorage.setItem('travel-map-provider', 'AMAP')
    const map: TravelMapInstance | null = await create(container(), { provider: 'OSM' })
    expect(map?.provider).toBe('OSM')
  })
})

describe('Leaflet 未加载', () => {
  it('明确报错，而不是静默降级', async () => {
    /*
     * 不做静默自动降级：页面自己决定怎么提示用户、要不要换一个 provider 重试，
     * 也不会替用户改掉已保存的手动选择。
     */
    vi.stubGlobal('L', undefined)
    await expect(create(container())).rejects.toThrow('地图组件加载失败')
  })
})
