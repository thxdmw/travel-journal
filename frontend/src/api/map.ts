import { get, withParams } from './client'
import type { Decimal } from '@/types/common'
import type { LocationView, MapSearchStatus } from '@/types/map'

/**
 * 地点搜索。注意这和地图「展示」用哪个 Provider 是两件事：
 * 国内搜索走高德，展示由 TravelMap 按访客网络国家码决定。
 */
export const mapApi = {
  status: () => get<MapSearchStatus>('/admin/map/status'),

  search: (keyword: string, region?: string) =>
    get<LocationView[]>('/admin/map/search', withParams({ keyword, region })),

  reverse: (latitude: Decimal, longitude: Decimal) =>
    get<LocationView>('/admin/map/reverse', withParams({ latitude, longitude })),
}
