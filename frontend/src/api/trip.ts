import { del, get, post, put, upload, withParams } from './client'
import type { JsonObject, PageResponse } from '@/types/common'
import type { MediaView } from '@/types/media'
import type { StopRequest, Trip, TripRequest, TripStop, TripStatus } from '@/types/trip'

export interface TripListParams {
  page?: number
  pageSize?: number
  keyword?: string
}

export const tripApi = {
  list: (params?: TripListParams) => get<PageResponse<Trip>>('/admin/trips', withParams({ ...params })),

  get: (id: number) => get<Trip>('/admin/trips/' + id),

  create: (body: TripRequest) => post<Trip>('/admin/trips', body),

  update: (id: number, body: TripRequest) => put<Trip>('/admin/trips/' + id, body),

  changeStatus: (id: number, status: TripStatus) =>
    put<Trip>('/admin/trips/' + id + '/status', { status }),

  /*
   * 旅行工作台的汇总数据。后端返回的是 Map<String,Object>，聚合了行程、预算、
   * 日记等多个模块的统计。等工作台本身迁到 SFC 时再连同它的消费方一起建模。
   * TODO(迁移): 迁移 trip-workspace 时把 dashboard 收窄成显式结构。
   */
  dashboard: (id: number) => get<JsonObject>('/admin/trips/' + id + '/dashboard'),

  uploadCover: (id: number, form: FormData) =>
    upload<MediaView>('/admin/trips/' + id + '/cover', form),

  clearCover: (id: number) => del<void>('/admin/trips/' + id + '/cover'),

  stops: (tripId: number) => get<TripStop[]>('/admin/trips/' + tripId + '/stops'),

  createStop: (tripId: number, body: StopRequest) =>
    post<TripStop>('/admin/trips/' + tripId + '/stops', body),

  updateStop: (id: number, body: StopRequest) => put<TripStop>('/admin/stops/' + id, body),

  deleteStop: (id: number) => del<void>('/admin/stops/' + id),
}
