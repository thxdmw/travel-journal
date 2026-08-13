import L, { type Marker as LeafletMarker, type Polyline as LeafletPolyline } from 'leaflet'
import { animateRoutePath } from './animate'
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
 * Leaflet + OSM 适配器。
 *
 * OSM 直接用 WGS84，所以这一份没有任何坐标转换——对外契约就是它的原生坐标系。
 */

const isValid = (point: LatLng): boolean => Number.isFinite(point[0]) && Number.isFinite(point[1])

export function createLeafletTravelMap(
  element: HTMLElement,
  options: TravelMapOptions,
): TravelMapInstance {
  const map = L.map(element, {
    scrollWheelZoom: options.scrollWheelZoom !== false,
    zoomControl: true,
  }).setView(options.center ?? [30, 110], options.zoom || 4)

  L.tileLayer(options.osmTileUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: options.osmAttribution || '© OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(map)

  let markers: LeafletMarker[] = []
  let polyline: LeafletPolyline | null = null

  function markerHandle(marker: LeafletMarker): MarkerHandle {
    return {
      setActive(active) {
        marker.getElement()?.classList.toggle('is-active', !!active)
      },
      openPopup() {
        marker.openPopup()
      },
      getPosition() {
        const point = marker.getLatLng()
        return [point.lat, point.lng]
      },
      remove() {
        map.removeLayer(marker)
        markers = markers.filter(item => item !== marker)
      },
    }
  }

  return {
    provider: 'OSM',
    raw: map,

    destroy() {
      markers.forEach(marker => map.removeLayer(marker))
      if (polyline) map.removeLayer(polyline)
      map.remove()
    },

    setCenter(point) {
      map.setView(point, map.getZoom())
    },

    panTo(point) {
      map.panTo(point, { animate: true, duration: 0.8 })
    },

    invalidateSize() {
      map.invalidateSize(false)
    },

    getZoom() {
      return map.getZoom()
    },

    zoomBy(delta) {
      map.setZoom(map.getZoom() + delta)
    },

    /** OSM 风格由统一的 data-map-style CSS 语义实现，不需要重建 TileLayer。 */
    setStyle() {},

    fitBounds(points: LatLng[], fitOptions?: FitBoundsOptions) {
      const opts = fitOptions ?? {}
      const valid = (points ?? []).filter(isValid)
      const first = valid[0]
      if (!first) return
      if (valid.length === 1) {
        map.setView(first, opts.maxZoom ?? map.getZoom())
        return
      }
      map.fitBounds(valid, { padding: opts.padding ?? [36, 36], maxZoom: opts.maxZoom ?? 15 })
    },

    addMarker(point: LatLng, markerOptions?: MarkerOptions) {
      const opts = markerOptions ?? {}
      const anchor = opts.iconAnchor ?? [14, 14]
      /*
       * icon 只在确实有自定义 HTML 时才放进选项。
       *
       * Leaflet 合并选项是逐键覆盖，显式传 `icon: undefined` 会把它自己的
       * L.Icon.Default 顶掉，随后 _initIcon 拿 undefined 去调 createIcon 直接抛错。
       * 现有调用方都传了 html 所以一直没触发，但没有理由留着这个坑。
       */
      const leafletOptions: Record<string, unknown> = { draggable: !!opts.draggable }
      if (opts.html) {
        leafletOptions.icon = L.divIcon({
          className: 'travel-map-marker',
          html: opts.html,
          iconSize: [anchor[0] * 2, anchor[1] * 2],
          iconAnchor: anchor,
        })
      }
      const marker = L.marker(point, leafletOptions).addTo(map)
      if (opts.popup) marker.bindPopup(opts.popup)
      if (opts.draggable && typeof opts.onDragEnd === 'function') {
        const onDragEnd = opts.onDragEnd
        marker.on('dragend', event => {
          const position = event.target.getLatLng()
          onDragEnd(position.lat, position.lng)
        })
      }
      markers.push(marker)
      return markerHandle(marker)
    },

    setRoute(points: LatLng[], routeOptions?: RouteOptions) {
      this.removeRoute()
      const opts = routeOptions ?? {}
      const valid = (points ?? []).filter(isValid)
      const first = valid[0]
      if (valid.length < 2 || !first) return
      const line = L.polyline(opts.animate ? [first] : valid, {
        color: opts.color || '#c96f4e',
        weight: opts.width || 4,
        opacity: opts.opacity == null ? 0.82 : opts.opacity,
        dashArray: opts.dashed ? '8 7' : undefined,
      }).addTo(map)
      polyline = line
      if (opts.animate) animateRoutePath(pts => line.setLatLngs(pts), valid, 1200)
    },

    removeRoute() {
      if (polyline) {
        map.removeLayer(polyline)
        polyline = null
      }
    },

    onClick(handler) {
      map.on('click', event => handler(event.latlng.lat, event.latlng.lng))
    },

    onInteractionStart(handler) {
      map.on('mousedown dragstart', handler as () => void)
    },
  }
}
