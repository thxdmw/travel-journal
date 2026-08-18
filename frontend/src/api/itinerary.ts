import { del, get, patch, post, put } from './client'
import type { Decimal, IsoDateTimeString, LocalDateString } from '@/types/common'

/** 后端 `LocalTime`，形如 `09:30` 或 `09:30:00`。同样不转 Date，避免凭空补出日期。 */
export type LocalTimeString = string

export interface ItineraryItem {
  id: number
  createdAt: IsoDateTimeString
  updatedAt: IsoDateTimeString
  tripId: number
  tripStopId: number | null
  itemDate: LocalDateString
  startTime: LocalTimeString | null
  endTime: LocalTimeString | null
  type: string
  title: string
  address: string | null
  note: string | null
  plannedCost: Decimal | null
  completed: boolean | null
  sortOrder: number | null
}

export interface ItineraryRequest {
  tripStopId?: number | null
  itemDate: LocalDateString
  startTime?: LocalTimeString | null
  endTime?: LocalTimeString | null
  type: string
  title: string
  address?: string
  note?: string
  plannedCost?: Decimal | null
  completed?: boolean | null
  /*
   * 这里没有 sortOrder，而且不要加回来。
   *
   * 新建的序号由后端取 MAX+1 分配，一律排在末尾；改顺序走 reorder 接口。以前表单里
   * 带着一个初值 0 一起发出去，新建的行程就会插到已经排好的顺序最前面。
   */
  /** 允许把行程排在旅行起止日期之外。默认不允许，避免手滑排错年份。 */
  allowOutsideTripDates?: boolean
}

export const itineraryApi = {
  list: (tripId: number) => get<ItineraryItem[]>('/admin/trips/' + tripId + '/itinerary'),

  create: (tripId: number, body: ItineraryRequest) =>
    post<ItineraryItem>('/admin/trips/' + tripId + '/itinerary', body),

  update: (id: number, body: ItineraryRequest) => put<ItineraryItem>('/admin/itinerary/' + id, body),

  remove: (id: number) => del<void>('/admin/itinerary/' + id),

  setCompleted: (id: number, completed: boolean) =>
    patch<ItineraryItem>('/admin/itinerary/' + id + '/completed', { completed }),
}
