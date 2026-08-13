/**
 * 与后端 `common/api` 对应的基础类型。
 *
 * 日期刻意分成两个别名而不是统一成 `Date`：后端 `LocalDate` 是「哪一天」，
 * 没有时刻也没有时区，转成 JS Date 会按本地时区解释，在 UTC+8 以外的机器上
 * 直接偏一天。前端全程按 `YYYY-MM-DD` 字符串传递，只在需要展示时格式化。
 */

/** 后端 `LocalDate`，形如 `2026-08-13`。 */
export type LocalDateString = string

/** 后端 `OffsetDateTime`，ISO-8601 带偏移，形如 `2026-08-13T10:30:00+08:00`。 */
export type IsoDateTimeString = string

/** 后端 `BigDecimal`。Jackson 默认序列化成 JSON number。 */
export type Decimal = number

/** 后端 `JsonNode` 对应的任意 JSON 值。用它而不是 any，调用方必须显式收窄。 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type JsonObject = { [key: string]: JsonValue }

/** 所有接口的统一响应外壳。业务代码拿不到它——client 的拦截器会剥掉。 */
export interface ApiResponse<T> {
  code: string
  message: string
  data: T
  requestId: string
}

export interface PageResponse<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/**
 * 请求失败时抛出的错误。
 *
 * 保留 `status` 和 `network` 两个判定位，让业务层能区分「服务端拒绝」和
 * 「根本没连上」——这两种情况给用户的提示和重试策略都不一样。
 */
export interface ApiError extends Error {
  status: number
  network: boolean
}

/** 坐标系。数据库长期标准是 WGS84，GCJ02 只出现在高德来源的历史数据里。 */
export type CoordinateSystem = 'WGS84' | 'GCJ02'
