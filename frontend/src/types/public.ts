import type {
  CoordinateSystem,
  Decimal,
  LocalDateString,
} from './common'
import type { JournalCard } from './journal'
import type { ThemeView } from './theme'
import type { TripStatus } from './trip'

/** 公开端的旅行卡片，对应 `PublicContentService.TripCard`。 */
export interface TripCard {
  id: number
  title: string
  slug: string
  summary: string | null
  status: TripStatus
  startDate: LocalDateString | null
  endDate: LocalDateString | null
  cities: string[]
  journalCount: number
  coverUrl: string | null
}

/** 公开端的停靠点视图。字段比后台 `TripStop` 少，不含备注等私有信息。 */
export interface TripStopView {
  cityName: string
  regionName: string | null
  countryName: string
  latitude: Decimal | null
  longitude: Decimal | null
  formattedAddress: string | null
  adcode: string | null
  coordinateSystem: CoordinateSystem | null
  arrivalDate: LocalDateString | null
  departureDate: LocalDateString | null
  sortOrder: number
}

export interface TripDetail {
  trip: TripCard
  stops: TripStopView[]
  journals: JournalCard[]
  theme: ThemeView | null
}

export interface TripLink {
  title: string
  slug: string
}

export interface JournalLink {
  title: string
  slug: string
  tripTitle: string | null
  tripSlug: string | null
}

/** 地图上的一个城市点，对应 `PublicContentService.CityMarker`。 */
export interface CityMarker {
  cityName: string
  regionName: string | null
  countryName: string
  adcode: string | null
  coordinateSystem: CoordinateSystem | null
  latitude: Decimal | null
  longitude: Decimal | null
  firstVisitedOn: LocalDateString | null
  visitedYears: number[]
  tripCount: number
  publishedJournalCount: number
  trips: TripLink[]
  journals: JournalLink[]
}

/** 首页数据。没有已发布日记时各项为空数组和 0。 */
export interface HomeView {
  recentJournals: JournalCard[]
  recentTrips: TripCard[]
  cityMarkers: CityMarker[]
  tripCount: number
  cityCount: number
  journalCount: number
  photoCount: number
}

export interface CityVisit {
  cityName: string
  countryName: string
  arrivalDate: LocalDateString | null
}

export interface TripSummary {
  title: string
  slug: string
  startDate: LocalDateString | null
  endDate: LocalDateString | null
  cityCount: number
  journalCount: number
}

/** 年度回顾，对应 `YearReviewService.YearReview`。 */
export interface YearReview {
  year: number
  tripCount: number
  cityCount: number
  countryCount: number
  journalCount: number
  photoCount: number
  distanceKm: number
  cities: CityVisit[]
  trips: TripSummary[]
  farthestCity: string | null
  longestTripDays: number
}
