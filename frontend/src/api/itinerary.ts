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
  sortOrder?: number | null
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
