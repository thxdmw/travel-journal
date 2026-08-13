import type {
  CoordinateSystem,
  Decimal,
  IsoDateTimeString,
  LocalDateString,
} from './common'

export const TRIP_STATUSES = ['PLANNING', 'ONGOING', 'COMPLETED', 'ARCHIVED'] as const
export type TripStatus = (typeof TRIP_STATUSES)[number]

/** 后台的旅行实体，`/admin/trips` 直接返回 entity。 */
export interface Trip {
  id: number
  createdAt: IsoDateTimeString
  updatedAt: IsoDateTimeString
  title: string
  slug: string
  summary: string | null
  status: TripStatus
  startDate: LocalDateString
  endDate: LocalDateString
  defaultCurrency: string
  coverMediaId: number | null
  /** 只给作者看的备注，不会出现在公开端。 */
  internalNote: string | null
  themeKey: string | null
}

/** 后台的停靠点实体。坐标按 `coordinateSystem` 解释，不要假定一定是 WGS84。 */
export interface TripStop {
  id: number
  createdAt: IsoDateTimeString
  updatedAt: IsoDateTimeString
  tripId: number
  cityName: string
  regionName: string | null
  countryName: string
  countryCode: string | null
  latitude: Decimal
  longitude: Decimal
  placeId: string | null
  formattedAddress: string | null
  adcode: string | null
  coordinateSystem: CoordinateSystem
  locationSource: string | null
  arrivalDate: LocalDateString | null
  departureDate: LocalDateString | null
  sortOrder: number
  note: string | null
}

export interface TripRequest {
  title: string
  slug: string
  summary?: string
  status: TripStatus
  startDate: LocalDateString
  endDate: LocalDateString
  defaultCurrency: string
  coverMediaId?: number | null
  internalNote?: string
  themeKey?: string | null
}

export interface StopRequest {
  cityName: string
  regionName?: string
  countryName: string
  countryCode?: string
  latitude: Decimal
  longitude: Decimal
  placeId?: string
  formattedAddress?: string
  adcode?: string
  coordinateSystem?: CoordinateSystem
  locationSource?: string
  arrivalDate?: LocalDateString | null
  departureDate?: LocalDateString | null
  sortOrder?: number
  note?: string
}
