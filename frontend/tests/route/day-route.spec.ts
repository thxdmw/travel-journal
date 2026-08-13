import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STEP_MS, buildPopup, render, safePoints, setMapTokensProvider } from '@/route/day-route'
import type { PlaybackState } from '@/route/day-route'
import type { LatLng, MarkerOptions, TravelMapInstance } from '@/types/travel-map'
import type { RoutePoint } from '@/types/moment'

/** 记录调用的假地图，够验路线与回放的行为。 */
function fakeMap() {
  const calls = {
    markers: [] as { point: LatLng; options: MarkerOptions }[],
    route: null as { points: LatLng[]; options: Record<string, unknown> } | null,
    routeRemoved: 0,
    fitBounds: null as LatLng[] | null,
    panned: [] as LatLng[],
    active: [] as boolean[],
    popupsOpened: 0,
    markersRemoved: 0,
  }
  let interactionHandler: (() => void) | null = null

  const map: TravelMapInstance = {
    provider: 'OSM',
    raw: null,
    destroy: () => undefined,
    setCenter: () => undefined,
    panTo: point => calls.panned.push(point),
    invalidateSize: () => undefined,
    getZoom: () => 4,
    zoomBy: () => undefined,
    setStyle: () => undefined,
    fitBounds: points => {
      calls.fitBounds = points
    },
    addMarker: (point, options) => {
      const index = calls.markers.length
      calls.markers.push({ point, options: options ?? {} })
      calls.active[index] = false
      return {
        setActive: active => {
          calls.active[index] = active
        },
        openPopup: () => {
          calls.popupsOpened += 1
        },
        getPosition: () => point,
        remove: () => {
          calls.markersRemoved += 1
        },
      }
    },
    setRoute: (points, options) => {
      calls.route = { points, options: (options ?? {}) as Record<string, unknown> }
    },
    removeRoute: () => {
      calls.routeRemoved += 1
    },
    onClick: () => undefined,
    onInteractionStart: handler => {
      interactionHandler = handler
    },
  }
  return { map, calls, fireInteraction: () => interactionHandler?.() }
}

const point = (overrides: Partial<RoutePoint> = {}): RoutePoint =>
  ({
    order: 1,
    time: '09:30',
    title: '山门',
    note: null,
    latitude: 30.9,
    longitude: 103.5,
    coordinateSystem: 'WGS84',
    photos: [],
    source: 'moment',
    ...overrides,
  }) as RoutePoint

beforeEach(() => {
  setMapTokensProvider(() => ({}))
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.useRealTimers()
})

describe('坐标过滤', () => {
  it('丢掉缺坐标和非法坐标的点', () => {
    /*
     * 与迁移前的差异，有意为之：旧实现只写 Number.isFinite(Number(x))，而
     * Number(null) 是 0，所以没有坐标的点会被当成 (0, 0) 画到几内亚湾去。
     * 后端的经纬度是可空的 BigDecimal，这种点真会出现。
     */
    const points = [
      point({ latitude: 30.9, longitude: 103.5 }),
      point({ latitude: null }),
      point({ longitude: null }),
      point({ latitude: undefined as never }),
      point({ latitude: '' as never }),
      point({ latitude: Number.NaN, longitude: 1 }),
      point({ latitude: 'abc' as never }),
    ] as RoutePoint[]
    expect(safePoints(points)).toHaveLength(1)
  })

  it('数字字符串仍然可用', () => {
    // 后端 BigDecimal 在某些序列化配置下会是字符串
    expect(safePoints([point({ latitude: '30.9' as never, longitude: '103.5' as never })])).toHaveLength(1)
  })

  it('赤道与本初子午线上的真实坐标不会被误杀', () => {
    expect(safePoints([point({ latitude: 0, longitude: 0 })])).toHaveLength(1)
  })

  it('空输入不报错', () => {
    expect(safePoints(null)).toEqual([])
    expect(safePoints(undefined)).toEqual([])
  })

  it('一个可用点都没有时不建路线', () => {
    const { map, calls } = fakeMap()
    expect(render(map, [point({ latitude: null })])).toBeNull()
    expect(calls.markers).toHaveLength(0)
  })

  it('没有地图时返回 null', () => {
    expect(render(null, [point()])).toBeNull()
  })
})

describe('弹窗内容', () => {
  it('用 textContent 填，用户输入不会被当作标记解析', () => {
    // 正文和地点名都是用户输入，拼字符串就是一条注入路径
    const popup = buildPopup(point({ title: '<img src=x onerror=alert(1)>', note: '<script>x</script>' }))
    expect(popup.querySelector('img')).toBeNull()
    expect(popup.querySelector('script')).toBeNull()
    expect(popup.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('时间与标题用间隔号连起来', () => {
    expect(buildPopup(point({ time: '09:30', title: '山门' })).querySelector('strong')?.textContent).toBe('09:30 · 山门')
  })

  it('缺一项时不留下孤零零的间隔号', () => {
    expect(buildPopup(point({ time: null, title: '山门' })).querySelector('strong')?.textContent).toBe('山门')
    expect(buildPopup(point({ time: '09:30', title: null })).querySelector('strong')?.textContent).toBe('09:30')
  })

  it('没有备注时不生成段落', () => {
    expect(buildPopup(point({ note: null })).querySelector('p')).toBeNull()
  })

  it('照片最多展示四张', () => {
    const photos = Array.from({ length: 7 }, (_v, i) => ({
      id: i,
      thumbnailUrl: '/api/media/' + i + '/thumbnail',
      displayUrl: '/api/media/' + i + '/display',
    }))
    const popup = buildPopup(point({ photos }))
    expect(popup.querySelectorAll('.day-route-shots img')).toHaveLength(4)
  })

  it('照片走缩略图并懒加载', () => {
    const photos = [{ id: 1, thumbnailUrl: '/api/media/1/thumbnail', displayUrl: '/api/media/1/display' }]
    const image = buildPopup(point({ photos })).querySelector('img')!
    expect(image.getAttribute('src')).toBe('/api/media/1/thumbnail')
    expect(image.loading).toBe('lazy')
  })
})

describe('绘制', () => {
  it('每个点一个带序号的标记', () => {
    const { map, calls } = fakeMap()
    render(map, [point({ order: 1 }), point({ order: 2, latitude: 31, longitude: 104 })])
    expect(calls.markers).toHaveLength(2)
    expect(calls.markers[0]?.options.html).toContain('>1<')
    expect(calls.markers[1]?.options.html).toContain('>2<')
  })

  it('弹窗以元素形式传给地图，不是字符串', () => {
    const { map, calls } = fakeMap()
    render(map, [point()])
    expect(calls.markers[0]?.options.popup).toBeInstanceOf(HTMLElement)
  })

  it('两个点以上才连线', () => {
    const { map, calls } = fakeMap()
    render(map, [point()])
    expect(calls.route).toBeNull()

    const second = fakeMap()
    render(second.map, [point(), point({ latitude: 31, longitude: 104 })])
    expect(second.calls.route?.points).toHaveLength(2)
  })

  it('实际走过的画实线，计划行程画虚线', () => {
    // 它们不是同一种事实，视觉上必须区分得开
    const walked = fakeMap()
    render(walked.map, [point(), point({ latitude: 31 })], { source: 'moment' })
    expect(walked.calls.route?.options.dashed).toBe(false)

    const planned = fakeMap()
    render(planned.map, [point(), point({ latitude: 31 })], { source: 'itinerary' })
    expect(planned.calls.route?.options.dashed).toBe(true)
  })

  it('调用方给的颜色和粗细优先于主题', () => {
    setMapTokensProvider(() => ({ color: '#themed', width: 9 }))
    const { map, calls } = fakeMap()
    render(map, [point(), point({ latitude: 31 })], { color: '#explicit', width: 2 })
    expect(calls.route?.options.color).toBe('#explicit')
    expect(calls.route?.options.width).toBe(2)
  })

  it('调用方没给时跟随主题的地图 token', () => {
    setMapTokensProvider(() => ({ color: '#themed', width: 9, animateRoute: true }))
    const { map, calls } = fakeMap()
    render(map, [point(), point({ latitude: 31 })])
    expect(calls.route?.options.color).toBe('#themed')
    expect(calls.route?.options.width).toBe(9)
    expect(calls.route?.options.animate).toBe(true)
  })

  it('两边都没有时用兜底样式', () => {
    const { map, calls } = fakeMap()
    render(map, [point(), point({ latitude: 31 })])
    expect(calls.route?.options.color).toBe('#c96f4e')
    expect(calls.route?.options.width).toBe(4)
  })

  it('refreshTheme 按新 token 重画', () => {
    const { map, calls } = fakeMap()
    const controller = render(map, [point(), point({ latitude: 31 })])
    setMapTokensProvider(() => ({ color: '#new' }))
    controller?.refreshTheme()
    expect(calls.route?.options.color).toBe('#new')
  })

  it('画完把视野框到全部点上', () => {
    const { map, calls } = fakeMap()
    render(map, [point(), point({ latitude: 31, longitude: 104 })])
    expect(calls.fitBounds).toHaveLength(2)
  })
})

describe('回放', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  const twoPoints = () => [point({ order: 1 }), point({ order: 2, latitude: 31, longitude: 104 })]

  it('逐点推进，每步都移动镜头并弹窗', () => {
    const { map, calls } = fakeMap()
    const controller = render(map, twoPoints())!

    controller.play()
    expect(calls.active).toEqual([true, false])
    expect(calls.panned).toHaveLength(1)
    expect(calls.popupsOpened).toBe(1)

    vi.advanceTimersByTime(STEP_MS)
    expect(calls.active).toEqual([false, true])
    expect(calls.panned).toHaveLength(2)
  })

  it('走到最后一个点之后自动停下', () => {
    const { map, calls } = fakeMap()
    const controller = render(map, twoPoints())!
    controller.play()
    vi.advanceTimersByTime(STEP_MS * 3)
    expect(controller.playing).toBe(false)
    expect(calls.active).toEqual([false, false])
  })

  it('再按一次就停，不需要单独的暂停按钮', () => {
    const { map } = fakeMap()
    const controller = render(map, twoPoints())!
    controller.play()
    expect(controller.playing).toBe(true)
    controller.play()
    expect(controller.playing).toBe(false)
  })

  it('回放时点一下地图就停，不跟用户抢镜头', () => {
    const { map, fireInteraction } = fakeMap()
    const controller = render(map, twoPoints())!
    controller.play()
    fireInteraction()
    expect(controller.playing).toBe(false)
  })

  it('没在回放时的地图交互不受影响', () => {
    const { map, fireInteraction } = fakeMap()
    const controller = render(map, twoPoints())!
    expect(() => fireInteraction()).not.toThrow()
    expect(controller.playing).toBe(false)
  })

  it('每一步都通知调用方当前状态', () => {
    const states: PlaybackState[] = []
    const { map } = fakeMap()
    const controller = render(map, twoPoints(), { onState: state => states.push(state) })!

    controller.play()
    expect(states[0]).toMatchObject({ playing: true, index: 0 })
    expect(states[0]?.point?.order).toBe(1)

    controller.stop()
    expect(states.at(-1)).toMatchObject({ playing: false, index: -1 })
  })

  it('停止后清掉计时器，不会再往下走', () => {
    const { map, calls } = fakeMap()
    const controller = render(map, twoPoints())!
    controller.play()
    controller.stop()
    vi.advanceTimersByTime(STEP_MS * 5)
    expect(calls.panned).toHaveLength(1)
  })

  it('destroy 停下回放并清掉标记与线', () => {
    const { map, calls } = fakeMap()
    const controller = render(map, twoPoints())!
    controller.play()
    controller.destroy()

    expect(controller.playing).toBe(false)
    expect(calls.markersRemoved).toBe(2)
    expect(calls.routeRemoved).toBeGreaterThan(0)
  })

  it('只有一个点时 destroy 不去删不存在的线', () => {
    const { map, calls } = fakeMap()
    render(map, [point()])!.destroy()
    expect(calls.routeRemoved).toBe(0)
  })
})
