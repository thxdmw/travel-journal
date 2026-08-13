import { gcj02ToWgs84, wgs84ToGcj02 } from './coordinates'
import { animateRoutePath } from './animate'
import { amapStyle, type AMapLngLat, type AMapMarker, type AMapNamespace, type AMapPolyline, type AMapInfoWindow } from './amap-sdk'
import type {
  FitBoundsOptions,
  LatLng,
  MarkerHandle,
  MarkerOptions,
  RouteOptions,
  TravelMapInstance,
  TravelMapOptions,
} from '@/types/travel-map'

/*
 * 高德适配器。
 *
 * 这个文件是整个地图层唯一知道 GCJ-02 存在的地方：进来的坐标是 WGS84，出去给
 * SDK 之前转成 GCJ-02；SDK 回调里拿到的是 GCJ-02，交给业务之前转回 WGS84。
 * 另外 AMap 的数组顺序是 [lng, lat]，和对外契约相反，转换和换序总是成对出现。
 */

const toGcj = (point: LatLng): LatLng => wgs84ToGcj02(point[0], point[1])

/** GCJ-02 的 [lat,lng] 换成 AMap 要的 [lng,lat]。 */
const toAMapPosition = (point: LatLng): number[] => {
  const gcj = toGcj(point)
  return [gcj[1], gcj[0]]
}

/** SDK 给回来的位置对象转成 WGS84 的 [lat,lng]。 */
function toWgs(lngLat: AMapLngLat | null | undefined): LatLng {
  const lat = typeof lngLat?.getLat === 'function' ? lngLat.getLat() : Number(lngLat?.lat)
  const lng = typeof lngLat?.getLng === 'function' ? lngLat.getLng() : Number(lngLat?.lng)
  return gcj02ToWgs84(lat, lng)
}

const isValid = (point: LatLng): boolean => Number.isFinite(point[0]) && Number.isFinite(point[1])

function htmlToElement(html: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  return (wrapper.firstElementChild as HTMLElement) ?? wrapper
}

export function createAMapTravelMap(
  AMap: AMapNamespace,
  element: HTMLElement,
  options: TravelMapOptions,
): TravelMapInstance {
  const center = options.center ? toGcj(options.center) : [35.0, 105.0]
  const map = new AMap.Map(element, {
    zoom: options.zoom || 4,
    center: [center[1], center[0]],
    viewMode: '2D',
    scrollWheel: options.scrollWheelZoom !== false,
    mapStyle: amapStyle(options.style),
  })

  let markers: AMapMarker[] = []
  let polyline: AMapPolyline | null = null
  let infoWindow: AMapInfoWindow | null = null
  /** 弹窗内容跟着 marker 走，但不能挂在 SDK 对象上，用一张边表。 */
  const popups = new WeakMap<AMapMarker, string | HTMLElement>()

  function openInfoWindow(marker: AMapMarker, content: string | HTMLElement): void {
    if (!infoWindow) {
      infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -28), anchor: 'bottom-center' })
    }
    infoWindow.setContent(content)
    infoWindow.open(map, marker.getPosition())
  }

  function markerHandle(marker: AMapMarker, htmlEl: HTMLElement | null): MarkerHandle {
    return {
      setActive(active) {
        htmlEl?.classList.toggle('is-active', !!active)
      },
      openPopup() {
        const content = popups.get(marker)
        if (content) openInfoWindow(marker, content)
      },
      getPosition() {
        return toWgs(marker.getPosition())
      },
      remove() {
        marker.setMap(null)
        markers = markers.filter(item => item !== marker)
      },
    }
  }

  return {
    provider: 'AMAP',
    raw: map,

    destroy() {
      markers.forEach(marker => marker.setMap(null))
      markers = []
      if (polyline) polyline.setMap(null)
      if (infoWindow) infoWindow.close()
      map.destroy()
    },

    setCenter(point) {
      map.setCenter(toAMapPosition(point))
    },

    panTo(point) {
      map.panTo(toAMapPosition(point))
    },

    /*
     * AMap JS API 2.0 会自动响应容器尺寸变化，这里不强依赖某个具体方法名——
     * 拿不到就什么都不做，好过因为方法名对不上而抛错炸掉整个地图初始化。
     */
    invalidateSize() {
      map.resize?.()
    },

    getZoom() {
      return map.getZoom()
    },

    zoomBy(delta) {
      map.setZoom(map.getZoom() + delta)
    },

    setStyle(style) {
      map.setMapStyle(amapStyle(style))
    },

    fitBounds(points: LatLng[], fitOptions?: FitBoundsOptions) {
      const opts = fitOptions ?? {}
      const valid = (points ?? []).filter(isValid)
      if (!valid.length) return
      const gcj = valid.map(toGcj)
      const first = gcj[0]
      if (gcj.length === 1 && first) {
        map.setCenter([first[1], first[0]])
        if (opts.maxZoom) map.setZoom(opts.maxZoom)
        return
      }
      const lats = gcj.map(point => point[0])
      const lngs = gcj.map(point => point[1])
      const bounds = new AMap.Bounds(
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      )
      map.setBounds(bounds, false)
      if (opts.maxZoom && map.getZoom() > opts.maxZoom) map.setZoom(opts.maxZoom)
    },

    addMarker(point: LatLng, markerOptions?: MarkerOptions) {
      const opts = markerOptions ?? {}
      const htmlEl = opts.html ? htmlToElement(opts.html) : null
      const anchor = opts.iconAnchor ?? [14, 14]
      const marker = new AMap.Marker({
        position: toAMapPosition(point),
        content: htmlEl ?? undefined,
        offset: htmlEl ? new AMap.Pixel(-anchor[0], -anchor[1]) : undefined,
        draggable: !!opts.draggable,
        map,
      })
      if (opts.popup) {
        const popup = opts.popup
        popups.set(marker, popup)
        marker.on('click', () => openInfoWindow(marker, popup))
      }
      if (opts.draggable && typeof opts.onDragEnd === 'function') {
        const onDragEnd = opts.onDragEnd
        marker.on('dragend', () => {
          const wgs = toWgs(marker.getPosition())
          onDragEnd(wgs[0], wgs[1])
        })
      }
      markers.push(marker)
      return markerHandle(marker, htmlEl)
    },

    setRoute(points: LatLng[], routeOptions?: RouteOptions) {
      this.removeRoute()
      const opts = routeOptions ?? {}
      const valid = (points ?? []).filter(isValid)
      if (valid.length < 2) return
      const toPath = (pts: readonly LatLng[]): number[][] => pts.map(toAMapPosition)
      const line = new AMap.Polyline({
        path: opts.animate ? [toPath(valid)[0]] : toPath(valid),
        strokeColor: opts.color || '#c96f4e',
        strokeWeight: opts.width || 4,
        strokeOpacity: opts.opacity == null ? 0.82 : opts.opacity,
        strokeStyle: opts.dashed ? 'dashed' : 'solid',
        map,
      })
      polyline = line
      if (opts.animate) animateRoutePath(pts => line.setPath(toPath(pts)), valid, 1200)
    },

    removeRoute() {
      if (polyline) {
        polyline.setMap(null)
        polyline = null
      }
    },

    onClick(handler) {
      map.on('click', event => {
        const wgs = toWgs(event.lnglat)
        handler(wgs[0], wgs[1])
      })
    },

    onInteractionStart(handler) {
      map.on('dragstart', handler as () => void)
      map.on('mousedown', handler as () => void)
    },
  }
}
