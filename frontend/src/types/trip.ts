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

/** 旅行工作台概览接口的聚合结果。 */
export interface TripDashboard {
  trip: Trip
  stopCount: number
  itineraryCount: number
  draftCount: number
  publishedCount: number
  budgetTotal: Decimal
  actualExpense: Decimal
  remainingBudget: Decimal
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

/*
 * 城市停靠点的完整表单（PUT 语义）：null 表示清空这个字段。
 *
 * 可空字段写成 `| null` 而不是只有 `?`，是为了让「作者清掉了这一项」能够被明确表达出来。
 * 后端对应的列都标了 FieldStrategy.ALWAYS，收到 null 会真的写进 NULL。
 */
export interface StopRequest {
  cityName: string
  regionName?: string
  countryName: string
  countryCode?: string
  latitude: Decimal
  longitude: Decimal
  placeId?: string | null
  formattedAddress?: string
  adcode?: string
  coordinateSystem?: CoordinateSystem
  locationSource?: string
  arrivalDate?: LocalDateString | null
  departureDate?: LocalDateString | null
  sortOrder?: number
  note?: string
}
