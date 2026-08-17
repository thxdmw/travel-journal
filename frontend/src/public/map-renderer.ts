import { create, resolveProvider } from '@/map'
import { mapTokens } from '@/theme/theme'
import type { Decimal, LocalDateString } from '@/types/common'
import type { JournalLink, TripLink } from '@/types/public'
import type { ResolvedProvider } from '@/map/provider'
import type { LatLng, TravelMapInstance } from '@/types/travel-map'

export interface PublicMapMarker {
  cityName: string
  countryName: string
  latitude: Decimal | null
  longitude: Decimal | null
  formattedAddress?: string | null
  arrivalDate?: LocalDateString | null
  departureDate?: LocalDateString | null
  tripCount?: number
  publishedJournalCount?: number
  trips?: TripLink[]
  journals?: JournalLink[]
}

export interface PublicMapRenderOptions {
  fit?: boolean
  route?: boolean
  maxZoom?: number
}

export async function createPublicMap(
  element: HTMLElement | null,
  markers: readonly PublicMapMarker[],
  options: boolean | PublicMapRenderOptions = {},
): Promise<TravelMapInstance | null> {
  if (!element) return null
  const settings = typeof options === 'boolean' ? { fit: options } : options
  return renderMapInto(element, settings, markers)
}

async function renderMapInto(
  element: HTMLElement,
  settings: PublicMapRenderOptions,
  markers: readonly PublicMapMarker[],
  forcedProvider?: ResolvedProvider,
): Promise<TravelMapInstance | null> {
  element.classList.remove('map-load-failed')
  element.querySelector('.map-load-message')?.remove()
  const resolved = forcedProvider ? { provider: forcedProvider } : await resolveProvider()
  let map: TravelMapInstance
  try {
    /*
     * 底图自带的滚轮缩放必须关掉。
     *
     * 页面里的地图是内容的一部分，不是一个需要独占滚轮的应用。开着它，读者一路往下
     * 滚，滚到地图上页面就停住、地图开始放大——想继续读下去还得先把鼠标挪开。
     * 缩放交给下面那个只认 Ctrl 的处理器，光滚轮一律留给页面滚动。
     */
    map = await create(element, {
      provider: resolved.provider, zoom: 3, style: mapTokens().style, scrollWheelZoom: false,
    }) as TravelMapInstance
  } catch {
    showMapLoadFailure(element, settings, markers, resolved.provider)
    return null
  }

  const zoomHint = document.createElement('div')
  zoomHint.className = 'map-zoom-hint'
  zoomHint.textContent = '按住 Ctrl + 滚轮缩放地图'
  element.appendChild(zoomHint)
  const ctrlWheel = (event: WheelEvent) => {
    // 不按 Ctrl 就当没看见，事件继续冒泡上去，页面照常滚动
    if (!event.ctrlKey) return
    // 按住 Ctrl 滚轮在浏览器里默认是「缩放整个页面」，这里要拦下来换成缩放地图
    event.preventDefault()
    event.stopPropagation()
    map.zoomBy(event.deltaY < 0 ? 1 : -1)
  }
  element.addEventListener('wheel', ctrlWheel, { passive: false })

  const points: LatLng[] = []
  const safeMarkers = markers.filter(marker => (
    marker.latitude != null
    && marker.longitude != null
    && Number.isFinite(Number(marker.latitude))
    && Number.isFinite(Number(marker.longitude))
    && !(Number(marker.latitude) === 0 && Number(marker.longitude) === 0)
  ))
  safeMarkers.forEach((marker, index) => {
    const point: LatLng = [Number(marker.latitude), Number(marker.longitude)]
    points.push(point)
    map.addMarker(point, {
      html: settings.route ? `<span class="route-marker">${index + 1}</span>` : '<span class="city-marker"></span>',
      iconAnchor: settings.route ? [14, 14] : [10, 10],
      popup: createPopup(marker, index, settings.route === true),
    })
  })
  if (settings.route && points.length > 1) {
    const theme = mapTokens()
    map.setRoute(points, { color: theme.color, width: theme.width, dashed: true, animate: theme.animateRoute })
  }
  if (settings.fit && points.length) {
    map.fitBounds(points, { padding: [30, 30], maxZoom: settings.maxZoom ?? (settings.route ? 11 : 6) })
  }
  requestAnimationFrame(() => map.invalidateSize())

  // 尺寸观察是可选的，滚轮监听的解绑不是——两者以前捆在同一个 if 里，
  // 没有 ResizeObserver 的环境会把监听器一直留在已经销毁的容器上
  const observer = window.ResizeObserver ? new ResizeObserver(() => map.invalidateSize()) : null
  observer?.observe(element)
  const destroyMap = map.destroy.bind(map)
  map.destroy = () => {
    observer?.disconnect()
    element.removeEventListener('wheel', ctrlWheel)
    destroyMap()
  }
  return map
}

function showMapLoadFailure(
  element: HTMLElement,
  settings: PublicMapRenderOptions,
  markers: readonly PublicMapMarker[],
  failedProvider: ResolvedProvider,
) {
  element.classList.add('map-load-failed')
  const box = document.createElement('div')
  box.className = 'map-load-message'
  const failedLabel = failedProvider === 'OSM' ? 'OSM' : '高德'
  const otherProvider: ResolvedProvider = failedProvider === 'OSM' ? 'AMAP' : 'OSM'
  const text = document.createElement('p')
  text.textContent = `${failedLabel}地图加载失败`
  box.appendChild(text)
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.className = 'map-retry-btn'
  retry.textContent = `尝试${otherProvider === 'OSM' ? 'OSM' : '高德'}`
  retry.addEventListener('click', () => {
    element.classList.remove('map-load-failed')
    box.remove()
    void renderMapInto(element, settings, markers, otherProvider)
  })
  box.appendChild(retry)
  element.appendChild(box)
}

function createPopup(marker: PublicMapMarker, index: number, route: boolean): HTMLElement {
  const root = document.createElement('div')
  root.className = 'travel-map-popup'
  const title = document.createElement('strong')
  title.textContent = `${route ? `${index + 1}. ` : ''}${[marker.cityName, marker.countryName].filter(Boolean).join(' · ')}`
  root.appendChild(title)
  if (marker.formattedAddress) {
    const address = document.createElement('p')
    address.textContent = marker.formattedAddress
    root.appendChild(address)
  }
  const details: string[] = []
  if (marker.arrivalDate) details.push(marker.arrivalDate + (marker.departureDate ? ` — ${marker.departureDate}` : ''))
  if (marker.tripCount != null) details.push(`${marker.tripCount} 次旅行`)
  if (marker.publishedJournalCount != null) details.push(`${marker.publishedJournalCount} 篇日记`)
  if (details.length) {
    const meta = document.createElement('small')
    meta.textContent = details.join(' · ')
    root.appendChild(meta)
  }
  marker.trips?.slice(0, 3).forEach(item => root.appendChild(popupLink(`旅行 · ${item.title}`, `#/trips/${encodeURIComponent(item.slug)}`)))
  marker.journals?.slice(0, 4).forEach(item => root.appendChild(popupLink(item.title, `#/journals/${encodeURIComponent(item.slug)}`)))
  return root
}

function popupLink(text: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a')
  link.textContent = text
  link.href = href
  return link
}
