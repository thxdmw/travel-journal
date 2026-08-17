import { del, get, post, put, upload, withParams } from './client'
import type { PageResponse } from '@/types/common'
import type { MediaView } from '@/types/media'
import type { StopRequest, Trip, TripDashboard, TripRequest, TripStop, TripStatus } from '@/types/trip'

export interface TripListParams {
  page?: number
  pageSize?: number
  keyword?: string
}

/** 旅行下拉用的轻量选项。 */
export interface TripOption {
  id: number
  title: string
  status: TripStatus
}

/** 删除一次旅行前的清点结果，对应 `TripService.DeletionSummary`。 */
export interface TripDeletionSummary {
  title: string
  journalCount: number
  momentCount: number
  photoCount: number
  stopCount: number
  itineraryCount: number
  expenseCount: number
}

export const tripApi = {
  list: (params?: TripListParams) => get<PageResponse<Trip>>('/admin/trips', withParams({ ...params })),

  /** 选择器专用：只有 id 和标题，不分页，旅行再多也不会被静默截断。 */
  options: () => get<TripOption[]>('/admin/trips/options'),

  get: (id: number) => get<Trip>('/admin/trips/' + id),

  create: (body: TripRequest) => post<Trip>('/admin/trips', body),

  update: (id: number, body: TripRequest) => put<Trip>('/admin/trips/' + id, body),

  /** 删除前的清点，用于在确认弹窗里说清楚这一下会带走多少东西。 */
  deletionSummary: (id: number) => get<TripDeletionSummary>('/admin/trips/' + id + '/deletion-summary'),

  /**
   * 删除旅行及其全部关联数据，不可撤销。
   *
   * 日常整理请改状态为「已归档」；这个接口是给误建、作废的旅行准备的，
   * 日记、随手记、照片文件、行程、预算和支出会一并消失。
   */
  remove: (id: number) => del<TripDeletionSummary>('/admin/trips/' + id),

  changeStatus: (id: number, status: TripStatus) =>
    put<Trip>('/admin/trips/' + id + '/status', { status }),

  dashboard: (id: number) => get<TripDashboard>('/admin/trips/' + id + '/dashboard'),

  uploadCover: (id: number, form: FormData) =>
    upload<MediaView>('/admin/trips/' + id + '/cover', form),

  clearCover: (id: number) => del<void>('/admin/trips/' + id + '/cover'),

  stops: (tripId: number) => get<TripStop[]>('/admin/trips/' + tripId + '/stops'),

  createStop: (tripId: number, body: StopRequest) =>
    post<TripStop>('/admin/trips/' + tripId + '/stops', body),

  updateStop: (id: number, body: StopRequest) => put<TripStop>('/admin/stops/' + id, body),

  deleteStop: (id: number) => del<void>('/admin/stops/' + id),
}
