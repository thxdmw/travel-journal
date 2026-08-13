import type { CoordinateSystem, Decimal } from './common'

/** 展示用的地图 Provider。AUTO 由访客网络国家码解析：CN → AMAP，其他 → OSM。 */
export type MapProvider = 'AUTO' | 'AMAP' | 'OSM'

/** 地图运行时配置，对应 `PublicMapController.RuntimeView`。 */
export interface MapRuntime {
  /** 访客的网络国家码，解析 AUTO 用。 */
  region: string | null
  mapProvider: MapProvider
  amapJsKey: string | null
  amapServiceHost: string | null
  osmTileUrl: string | null
  osmAttribution: string | null
}

/** 地点搜索能力，对应 `MapLocationService.status()`。没配 key 时只留地图选点。 */
export interface MapSearchStatus {
  /** 搜索服务商，目前只有 amap。 */
  provider: string
  searchEnabled: boolean
  /** 搜索结果对外统一的坐标系。 */
  coordinateSystem: CoordinateSystem
}

/**
 * 地点搜索结果，对应 `MapLocationService.LocationView`。
 *
 * 展示 Provider 和搜索 Provider 是两个概念：这里的坐标可能来自高德（GCJ02），
 * 落库前按 `coordinateSystem` 处理，不要默认它是 WGS84。
 */
export interface LocationView {
  placeId: string | null
  name: string
  formattedAddress: string | null
  province: string | null
  city: string | null
  district: string | null
  country: string | null
  countryCode: string | null
  adcode: string | null
  latitude: Decimal
  longitude: Decimal
  coordinateSystem: CoordinateSystem
  /** AMAP_SEARCH / AMAP_REVERSE / MAP_PICK / MANUAL */
  locationSource: string | null
}
