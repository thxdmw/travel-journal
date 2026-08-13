import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAMapTravelMap } from '@/map/amap'
import { amapStyle } from '@/map/amap-sdk'
import { gcj02ToWgs84, wgs84ToGcj02 } from '@/map/coordinates'
import type { AMapLngLat, AMapNamespace } from '@/map/amap-sdk'

/*
 * 坐标系边界。
 *
 * 整个地图层只有 AMap 适配器知道 GCJ-02 存在：进去的是 WGS84，交给 SDK 之前
 * 转成 GCJ-02 并换成 [lng, lat]；SDK 回调里是 GCJ-02，交给业务之前转回 WGS84。
 * 这两次转换漏掉任何一次，地图上的点就会偏出去几百米，而且不会报错。
 *
 * 用一个记录调用参数的假 SDK 来验证边界两侧的值。
 */

/** 记下 SDK 实际收到了什么。 */
const seen = {
  mapOptions: null as Record<string, unknown> | null,
  markerOptions: [] as Record<string, unknown>[],
  polylineOptions: null as Record<string, unknown> | null,
  center: null as number[] | null,
  bounds: null as { sw: number[]; ne: number[] } | null,
  style: null as string | null,
}

const handlers = new Map<string, (event: { lnglat: AMapLngLat }) => void>()
const markerHandlers = new Map<string, () => void>()

function fakeAMap(): AMapNamespace {
  return {
    Map: class {
      constructor(_element: HTMLElement, options: Record<string, unknown>) {
        seen.mapOptions = options
      }
      destroy() {}
      setCenter(position: number[]) {
        seen.center = position
      }
      panTo(position: number[]) {
        seen.center = position
      }
      getZoom() {
        return 8
      }
      setZoom() {}
      setMapStyle(style: string) {
        seen.style = style
      }
      setBounds() {}
      on(event: string, handler: (payload: { lnglat: AMapLngLat }) => void) {
        handlers.set(event, handler)
      }
    } as unknown as AMapNamespace['Map'],

    Marker: class {
      position: number[]
      constructor(options: Record<string, unknown>) {
        seen.markerOptions.push(options)
        this.position = options.position as number[]
      }
      getPosition(): AMapLngLat {
        return { lat: this.position[1] as number, lng: this.position[0] as number }
      }
      setMap() {}
      on(event: string, handler: () => void) {
        markerHandlers.set(event, handler)
      }
    } as unknown as AMapNamespace['Marker'],

    Polyline: class {
      constructor(options: Record<string, unknown>) {
        seen.polylineOptions = options
      }
      setPath() {}
      setMap() {}
    } as unknown as AMapNamespace['Polyline'],

    InfoWindow: class {
      setContent() {}
      open() {}
      close() {}
    } as unknown as AMapNamespace['InfoWindow'],

    Pixel: class {
      constructor(
        public x: number,
        public y: number,
      ) {}
    } as unknown as AMapNamespace['Pixel'],

    Bounds: class {
      constructor(sw: number[], ne: number[]) {
        seen.bounds = { sw, ne }
      }
    } as unknown as AMapNamespace['Bounds'],
  }
}

/** 北京天安门，境内点，转换后必定有偏移。 */
const BEIJING: [number, number] = [39.9042, 116.4074]
const BEIJING_GCJ = wgs84ToGcj02(...BEIJING)

let element: HTMLElement

beforeEach(() => {
  seen.mapOptions = null
  seen.markerOptions = []
  seen.polylineOptions = null
  seen.center = null
  seen.bounds = null
  seen.style = null
  handlers.clear()
  markerHandlers.clear()
  element = document.createElement('div')
  document.documentElement.removeAttribute('data-scheme')
})

const build = (options = {}) => createAMapTravelMap(fakeAMap(), element, options)

describe('传给 SDK 的坐标已转成 GCJ-02 并换成 [lng, lat]', () => {
  it('初始中心', () => {
    build({ center: BEIJING })
    expect(seen.mapOptions?.center).toEqual([BEIJING_GCJ[1], BEIJING_GCJ[0]])
  })

  it('setCenter 与 panTo', () => {
    const map = build()
    map.setCenter(BEIJING)
    expect(seen.center).toEqual([BEIJING_GCJ[1], BEIJING_GCJ[0]])

    seen.center = null
    map.panTo(BEIJING)
    expect(seen.center).toEqual([BEIJING_GCJ[1], BEIJING_GCJ[0]])
  })

  it('标记位置', () => {
    build().addMarker(BEIJING)
    expect(seen.markerOptions[0]?.position).toEqual([BEIJING_GCJ[1], BEIJING_GCJ[0]])
  })

  it('路线上的每一个点', () => {
    const shanghai: [number, number] = [31.2304, 121.4737]
    build().setRoute([BEIJING, shanghai])
    const path = seen.polylineOptions?.path as number[][]
    const shanghaiGcj = wgs84ToGcj02(...shanghai)
    expect(path[0]).toEqual([BEIJING_GCJ[1], BEIJING_GCJ[0]])
    expect(path[1]).toEqual([shanghaiGcj[1], shanghaiGcj[0]])
  })

  it('fitBounds 的边界框', () => {
    const shanghai: [number, number] = [31.2304, 121.4737]
    const shanghaiGcj = wgs84ToGcj02(...shanghai)
    build().fitBounds([BEIJING, shanghai])

    /*
     * Bounds 是 [lng, lat] 顺序的西南角与东北角。北京经度小、纬度大，上海反过来，
     * 所以两个角各取自不同的点——这正是容易写反的地方。
     */
    expect(seen.bounds?.sw[0]).toBeCloseTo(BEIJING_GCJ[1], 4)
    expect(seen.bounds?.sw[1]).toBeCloseTo(shanghaiGcj[0], 4)
    expect(seen.bounds?.ne[0]).toBeCloseTo(shanghaiGcj[1], 4)
    expect(seen.bounds?.ne[1]).toBeCloseTo(BEIJING_GCJ[0], 4)
  })

  it('单点 fitBounds 走 setCenter 分支', () => {
    build().fitBounds([BEIJING])
    expect(seen.center).toEqual([BEIJING_GCJ[1], BEIJING_GCJ[0]])
  })

  it('确实发生了偏移，不是原样透传', () => {
    // 这条是上面所有断言的前提：如果转换是个恒等函数，那些断言会全部通过却毫无意义
    expect(BEIJING_GCJ[0]).not.toBe(BEIJING[0])
    expect(BEIJING_GCJ[1]).not.toBe(BEIJING[1])
  })
})

describe('从 SDK 回来的坐标已转回 WGS84', () => {
  it('地图点击', () => {
    const received: [number, number][] = []
    build().onClick((lat, lng) => received.push([lat, lng]))

    // SDK 给的是 GCJ-02
    handlers.get('click')?.({ lnglat: { lat: BEIJING_GCJ[0], lng: BEIJING_GCJ[1] } })
    const expected = gcj02ToWgs84(BEIJING_GCJ[0], BEIJING_GCJ[1])
    expect(received[0]?.[0]).toBeCloseTo(expected[0], 6)
    expect(received[0]?.[1]).toBeCloseTo(expected[1], 6)
    // 且结果接近原始的 WGS84 输入
    expect(received[0]?.[0]).toBeCloseTo(BEIJING[0], 4)
  })

  it('支持 getLat/getLng 形式的位置对象', () => {
    const received: [number, number][] = []
    build().onClick((lat, lng) => received.push([lat, lng]))
    handlers.get('click')?.({
      lnglat: { getLat: () => BEIJING_GCJ[0], getLng: () => BEIJING_GCJ[1] },
    })
    expect(received[0]?.[0]).toBeCloseTo(BEIJING[0], 4)
  })

  it('标记拖拽结束', () => {
    const onDragEnd = vi.fn()
    build().addMarker(BEIJING, { draggable: true, onDragEnd })
    markerHandlers.get('dragend')?.()
    expect(onDragEnd).toHaveBeenCalledOnce()
    expect(onDragEnd.mock.calls[0]?.[0]).toBeCloseTo(BEIJING[0], 4)
    expect(onDragEnd.mock.calls[0]?.[1]).toBeCloseTo(BEIJING[1], 4)
  })

  it('getPosition 返回 WGS84', () => {
    const handle = build().addMarker(BEIJING)
    const [lat, lng] = handle.getPosition()
    expect(lat).toBeCloseTo(BEIJING[0], 4)
    expect(lng).toBeCloseTo(BEIJING[1], 4)
  })
})

describe('路线与标记的选项', () => {
  it('少于两个点不画线', () => {
    build().setRoute([BEIJING])
    expect(seen.polylineOptions).toBeNull()
  })

  it('过滤掉非法坐标', () => {
    build().setRoute([BEIJING, [NaN, NaN], [31.2304, 121.4737]])
    expect((seen.polylineOptions?.path as number[][]).length).toBe(2)
  })

  it('动画模式只先画第一个点', () => {
    build().setRoute([BEIJING, [31.2304, 121.4737]], { animate: true })
    expect((seen.polylineOptions?.path as number[][]).length).toBe(1)
  })

  it('样式选项按传入值走，未传时用默认', () => {
    build().setRoute([BEIJING, [31, 121]], { color: '#123456', width: 8, dashed: true, opacity: 0.5 })
    expect(seen.polylineOptions?.strokeColor).toBe('#123456')
    expect(seen.polylineOptions?.strokeWeight).toBe(8)
    expect(seen.polylineOptions?.strokeStyle).toBe('dashed')
    expect(seen.polylineOptions?.strokeOpacity).toBe(0.5)
  })

  it('opacity 传 0 时不被默认值顶掉', () => {
    build().setRoute([BEIJING, [31, 121]], { opacity: 0 })
    expect(seen.polylineOptions?.strokeOpacity).toBe(0)
  })

  it('自定义 HTML 标记按锚点设置偏移', () => {
    build().addMarker(BEIJING, { html: '<i class="pin"></i>', iconAnchor: [10, 20] })
    const offset = seen.markerOptions[0]?.offset as { x: number; y: number }
    expect(offset.x).toBe(-10)
    expect(offset.y).toBe(-20)
  })
})

describe('地图风格映射', () => {
  it('auto 在浅色下用标准彩色底图', () => {
    // whitesmoke 那种近灰白样式会让浅色主题看起来像地图没有颜色
    expect(amapStyle('auto')).toBe('amap://styles/normal')
  })

  it('auto 在暗色主题下用暗色底图', () => {
    document.documentElement.dataset.scheme = 'dark'
    expect(amapStyle('auto')).toBe('amap://styles/dark')
  })

  it('复古与地形有专用样式', () => {
    expect(amapStyle('vintage')).toBe('amap://styles/macaron')
    expect(amapStyle('terrain')).toBe('amap://styles/fresh')
  })

  it('未知风格退回标准底图', () => {
    expect(amapStyle('没这个')).toBe('amap://styles/normal')
    expect(amapStyle(undefined)).toBe('amap://styles/normal')
  })
})
