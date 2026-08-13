import type { LatLng, TravelMapInstance, TravelMapOptions } from '@/types/travel-map'

/*
 * 一个够用就好的地图底图，给后台自己看的那些页面用（随手记回放等）。
 *
 * 公开端的建图额外做了 provider 加载失败提示、Ctrl+滚轮缩放这些事，因为它面向
 * 的是不特定的读者和网络。后台只有站主一个人在用，走同一套 TravelMap，但不需要
 * 那一层失败提示 UI，失败就返回 null。
 */

export interface SimpleMapOptions {
  center?: LatLng
  zoom?: number
  provider?: 'AMAP' | 'OSM'
}

/**
 * 建图与地图样式的来源。
 *
 * 和 day-route 同样的理由：地图与本模块若分属不同产物，直接 import 会拿到第二份
 * 模块实例——那份实例有自己的容器队列，同容器的串行保护会失效。由调用方注入。
 */
export interface SimpleMapDeps {
  create(element: HTMLElement, options: TravelMapOptions): Promise<TravelMapInstance | null>
  mapStyle(): string | undefined
}

let deps: SimpleMapDeps | null = null

export function setSimpleMapDeps(value: SimpleMapDeps): void {
  deps = value
}

export async function simpleMap(
  element: HTMLElement | null | undefined,
  options?: SimpleMapOptions,
): Promise<TravelMapInstance | null> {
  if (!element || !deps) return null
  const settings = options ?? {}
  try {
    const map = await deps.create(element, {
      center: settings.center ?? [30, 110],
      zoom: settings.zoom ?? 4,
      scrollWheelZoom: true,
      provider: settings.provider,
      style: deps.mapStyle(),
    })
    if (!map) return null
    // 容器往往是刚插进 DOM 的，尺寸要等一帧才定下来
    requestAnimationFrame(() => map.invalidateSize())
    return map
  } catch {
    // 后台页面失败就是没有地图，不弹提示
    return null
  }
}
