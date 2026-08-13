/** 地图适配层的对外契约。坐标一律是 WGS84，数组顺序一律是 [latitude, longitude]。 */

export type LatLng = [number, number]

export interface MarkerHandle {
  setActive(active: boolean): void
  openPopup(): void
  /** 返回 WGS84 坐标，即使底层用的是 GCJ-02。 */
  getPosition(): LatLng
  remove(): void
}

export interface MarkerOptions {
  /** 自定义标记的 HTML。给了就用它，不用 Provider 的默认图钉。 */
  html?: string
  popup?: string
  draggable?: boolean
  /** 图标锚点，像素。默认 [14,14] 即 28×28 图标的中心。 */
  iconAnchor?: [number, number]
  /** 拖拽结束回调，收到的是 WGS84。 */
  onDragEnd?: (latitude: number, longitude: number) => void
}

export interface RouteOptions {
  color?: string
  width?: number
  opacity?: number
  dashed?: boolean
  /** 从起点逐段延伸地画出来，而不是一次性铺满。 */
  animate?: boolean
}

export interface FitBoundsOptions {
  maxZoom?: number
  padding?: [number, number]
}

export interface TravelMapOptions {
  center?: LatLng
  zoom?: number
  scrollWheelZoom?: boolean
  /** 显式指定时跳过 Provider 解析，用于手动切换和失败重试。 */
  provider?: 'AMAP' | 'OSM'
  style?: string
  osmTileUrl?: string
  osmAttribution?: string
}

/** Provider 无关的地图实例。业务代码只认这个接口，不碰 Leaflet 或 AMap 的 API。 */
export interface TravelMapInstance {
  provider: 'AMAP' | 'OSM'
  /** 底层实例。只给确实需要 Provider 专有能力的地方，普通业务不要用。 */
  raw: unknown
  destroy(): void
  setCenter(point: LatLng): void
  panTo(point: LatLng): void
  invalidateSize(): void
  getZoom(): number
  zoomBy(delta: number): void
  setStyle(style: string): void
  fitBounds(points: LatLng[], options?: FitBoundsOptions): void
  addMarker(point: LatLng, options?: MarkerOptions): MarkerHandle
  setRoute(points: LatLng[], options?: RouteOptions): void
  removeRoute(): void
  /** 点击回调收到的是 WGS84。 */
  onClick(handler: (latitude: number, longitude: number) => void): void
  onInteractionStart(handler: () => void): void
}
