import type { LatLng, MarkerHandle, TravelMapInstance } from '@/types/travel-map'
import type { MapTokens } from '@/types/theme'
import type { RoutePoint } from '@/types/moment'

/*
 * 今日路线与回放。
 *
 * 一篇日记读完之后，「那天到底是怎么走的」是最自然的下一个问题。这个模块把
 * 服务端算好的路线点画在地图上，并提供一个回放：按时间依次把镜头移到每个点，
 * 停一下，弹出当时写的那句话和拍的照片。
 *
 * 回放的意义是把人放回当时的现场，所以它刻意慢——每个点停三秒多，而不是快速
 * 扫过去。任何时候点一下地图或按 Esc 都能停下。
 *
 * 地图实例由调用方创建并传进来（公开端和后台各有自己的瓦片配置），这里只负责
 * 画点、连线和控制回放节奏。
 */

/** 每个点停留多久。慢一点才像回忆，快了就只是动画。 */
export const STEP_MS = 3200

export interface PlaybackState {
  playing: boolean
  index: number
  point?: RoutePoint
}

export interface RenderOptions {
  color?: string
  width?: number
  /** 'moment' 表示实际走过的，画实线；其余（计划行程）画虚线。 */
  source?: string
  onState?: (state: PlaybackState) => void
}

export interface DayRouteController {
  play(): void
  stop(): void
  /** 主题变化后重新套用路线样式。 */
  refreshTheme(): void
  readonly playing: boolean
  destroy(): void
}

/**
 * 主题的地图 token 从哪里取。
 *
 * 和特效运行时同样的理由：主题与本模块是两个独立产物，直接 import 会拿到本
 * bundle 里那份从未赋值的实例。由调用方注入。
 */
export type MapTokensProvider = () => Partial<MapTokens>

let mapTokens: MapTokensProvider = () => ({})

export function setMapTokensProvider(provider: MapTokensProvider): void {
  mapTokens = provider
}

/**
 * 坐标可用才画。
 *
 * 空值必须先挡掉再转数字：`Number(null)` 和 `Number('')` 都是 0，而 0 是有限数，
 * 只写 `Number.isFinite(Number(x))` 会让没有坐标的点被当成 (0, 0) 画到几内亚湾去。
 * 后端的 latitude / longitude 是可空的 BigDecimal，这种点是真会出现的。
 */
function usableCoordinate(value: unknown): boolean {
  if (value == null || value === '') return false
  return Number.isFinite(Number(value))
}

/** 坐标缺失或非法的点直接丢掉，画不出来也不该让整条路线失败。 */
export function safePoints(points: readonly RoutePoint[] | null | undefined): RoutePoint[] {
  return (points ?? []).filter(
    point => usableCoordinate(point?.latitude) && usableCoordinate(point?.longitude),
  )
}

/** 弹窗内容用 DOM 拼而不是拼字符串——正文和地点名都是用户输入的。 */
export function buildPopup(point: RoutePoint): HTMLElement {
  const root = document.createElement('div')
  root.className = 'travel-map-popup day-route-popup'

  const title = document.createElement('strong')
  title.textContent = [point.time, point.title].filter(Boolean).join(' · ')
  root.appendChild(title)

  if (point.note) {
    const note = document.createElement('p')
    note.textContent = point.note
    root.appendChild(note)
  }

  if (point.photos?.length) {
    const shots = document.createElement('div')
    shots.className = 'day-route-shots'
    // 最多四张，弹窗里塞不下更多，也没必要
    point.photos.slice(0, 4).forEach(photo => {
      const image = document.createElement('img')
      image.src = photo.thumbnailUrl
      image.alt = point.title || '旅行照片'
      image.loading = 'lazy'
      shots.appendChild(image)
    })
    root.appendChild(shots)
  }
  return root
}

/** 在地图上画出一天的路线，返回回放控制器。没有可用点时返回 null。 */
export function render(
  map: TravelMapInstance | null | undefined,
  points: readonly RoutePoint[] | null | undefined,
  options?: RenderOptions,
): DayRouteController | null {
  const settings = options ?? {}
  const list = safePoints(points)
  if (!map || !list.length) return null

  const markers: MarkerHandle[] = []
  const coords: LatLng[] = []

  list.forEach(point => {
    const position: LatLng = [Number(point.latitude), Number(point.longitude)]
    coords.push(position)
    markers.push(
      map.addMarker(position, {
        html: '<span class="route-marker">' + (point.order ?? markers.length + 1) + '</span>',
        iconAnchor: [14, 14],
        // 传元素而不是字符串：正文和地点名都是用户输入，拼成 HTML 就是注入路径
        popup: buildPopup(point),
      }),
    )
  })

  const hasLine = coords.length > 1

  /*
   * 计划来的那条线用虚线，实际走过的用实线——它们不是同一种事实。
   * 颜色和粗细优先用调用方明确传入的值，否则跟随当前主题的地图 token。
   */
  function applyRouteTheme(): void {
    if (!hasLine || !map) return
    const theme = mapTokens() ?? {}
    map.setRoute(coords, {
      color: settings.color || theme.color || '#c96f4e',
      width: settings.width || theme.width || 4,
      opacity: 0.82,
      dashed: settings.source !== 'moment',
      animate: !!theme.animateRoute,
    })
  }

  applyRouteTheme()
  if (coords.length) map.fitBounds(coords, { padding: [36, 36], maxZoom: 15 })

  let timer: ReturnType<typeof setTimeout> | null = null
  let index = -1

  function stop(): void {
    if (timer) clearTimeout(timer)
    timer = null
    index = -1
    markers.forEach(marker => marker.setActive(false))
    settings.onState?.({ playing: false, index: -1 })
  }

  function step(): void {
    index += 1
    if (index >= markers.length) {
      stop()
      return
    }
    markers.forEach((marker, i) => marker.setActive(i === index))
    const marker = markers[index]
    if (marker && map) {
      map.panTo(marker.getPosition())
      marker.openPopup()
    }
    const point = list[index]
    settings.onState?.(point ? { playing: true, index, point } : { playing: true, index })
    timer = setTimeout(step, STEP_MS)
  }

  function play(): void {
    // 再按一次就是停止，不需要单独的暂停按钮
    if (timer) {
      stop()
      return
    }
    index = -1
    step()
  }

  // 回放时随便点一下地图就停：正在看的人想自己操作，不该跟它抢镜头
  map.onInteractionStart(() => {
    if (timer) stop()
  })

  return {
    play,
    stop,
    refreshTheme: applyRouteTheme,
    get playing() {
      return !!timer
    },
    destroy() {
      stop()
      markers.forEach(marker => marker.remove())
      if (hasLine) map.removeRoute()
    },
  }
}
