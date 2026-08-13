import type {
  CoordinateSystem,
  Decimal,
  IsoDateTimeString,
  LocalDateString,
} from './common'
import type { MediaView } from './media'

/**
 * 随手记，对应后端 `MomentService.MomentView`。
 *
 * 写入路径上几乎全部字段可选：「二十秒记完」这件事经不起任何一次校验失败，
 * 只要知道属于哪次旅行就能落库，其余之后补。
 */
export interface MomentView {
  id: number
  /** 前端生成的幂等 id，离线补传时用来避免重复落库。 */
  clientId: string | null
  tripId: number
  tripStopId: number | null
  cityName: string | null
  occurredAt: IsoDateTimeString | null
  day: LocalDateString | null
  occurredZoneId: string | null
  utcOffsetMinutes: number | null
  content: string | null
  placeName: string | null
  latitude: Decimal | null
  longitude: Decimal | null
  mood: string | null
  /** 已整理进哪篇日记。为 null 表示还散着。 */
  journalEntryId: number | null
  sorted: boolean
  photos: MediaView[]
}

export interface MomentRequest {
  clientId?: string
  tripId?: number | null
  tripStopId?: number | null
  occurredAt?: IsoDateTimeString | null
  occurredLocalDate?: LocalDateString | null
  occurredZoneId?: string | null
  utcOffsetMinutes?: number | null
  content?: string
  placeName?: string
  latitude?: Decimal | null
  longitude?: Decimal | null
  mood?: string
}

/** 把一天的随手记整理成日记草稿。 */
export interface ComposeRequest {
  tripId: number
  day?: LocalDateString | null
  /** 追加到哪篇日记；缺席则新建一篇草稿。 */
  journalId?: number | null
  /** 为空表示追加，不会冲掉已经写好的部分。 */
  replace?: boolean
  useAi?: boolean
}

export interface ComposeResult {
  journalId: number
  momentCount: number
  photoCount: number
  created: boolean
  /** AI 是否真的润色了。没配 key 时走规则式那条路，这里为 false。 */
  polished: boolean
}

/** 路线点上的照片。只给展示地址，不暴露原图。 */
export interface RoutePhoto {
  id: number
  thumbnailUrl: string
  displayUrl: string
}

/** 一天的路线点，对应 `DayRouteService.RoutePoint`。 */
export interface RoutePoint {
  order: number
  time: string | null
  title: string | null
  note: string | null
  latitude: Decimal | null
  longitude: Decimal | null
  coordinateSystem: CoordinateSystem | null
  photos: RoutePhoto[]
  source: string | null
}
