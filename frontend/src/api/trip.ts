import { del, get, post, put, upload, withParams } from './client'
import type { PageResponse } from '@/types/common'
import type { MediaView } from '@/types/media'
import type { StopRequest, Trip, TripDashboard, TripRequest, TripStop, TripStatus } from '@/types/trip'

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
