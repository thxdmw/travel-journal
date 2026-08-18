import type { IsoDateTimeString, JsonObject, LocalDateString } from './common'
import type { MediaView } from './media'
import type { RoutePoint } from './moment'
import type { ThemeView } from './theme'

export const JOURNAL_STATUSES = ['DRAFT', 'PUBLISHED'] as const
export type JournalStatus = (typeof JOURNAL_STATUSES)[number]

/**
 * 后台的日记实体，`/admin/journals/{id}` 直接返回它。
 *
 * `contentJson` 里的 Blocks 是正文的唯一数据源——不存在第二份 Markdown 或 HTML，
 * 任何渲染和编辑都从它出发。
 */
export interface JournalEntry {
  id: number
  createdAt: IsoDateTimeString
  updatedAt: IsoDateTimeString
  tripId: number | null
  tripStopId: number | null
  title: string
  slug: string
  excerpt: string | null
  contentJson: JsonObject | null
  status: JournalStatus
  occurredOn: LocalDateString | null
  coverMediaId: number | null
  publishedAt: IsoDateTimeString | null
  themeKey: string | null
  templateId: number | null
  templateVersion: number | null
  tags: string[] | null
  /** 所属旅行标题。只有列表接口回填，独立日记为 null。 */
  tripTitle?: string | null
  /** 草稿保存的乐观锁版本号，每次成功写入自增 1。 */
  revision?: number | null
}

/** 公开端的日记卡片，对应 `PublicContentService.JournalCard`。 */
export interface JournalCard {
  id: number
  title: string
  slug: string
  excerpt: string | null
  occurredOn: LocalDateString | null
  tripTitle: string | null
  tripSlug: string | null
  cityName: string | null
  coverUrl: string | null
}

/** 公开端的日记详情，对应 `PublicContentService.JournalDetail`。 */
export interface JournalDetail {
  journal: JournalCard
  contentJson: JsonObject | null
  media: MediaView[]
  previousSlug: string | null
  nextSlug: string | null
  theme: ThemeView | null
  /** 这一天已整理进日记的随手记路线。没整理的不会公开。 */
  route: RoutePoint[]
}

/** 日记本身的字段，不含并发协议那部分。 */
export interface JournalFields {
  tripId?: number | null
  tripStopId?: number | null
  title: string
  slug: string
  excerpt?: string
  contentJson: JsonObject
  occurredOn: LocalDateString
  coverMediaId?: number | null
  themeKey?: string | null
  templateId?: number | null
  templateVersion?: number | null
  /** 传 null 表示不改动标签，传空数组表示清空。 */
  tags?: string[] | null
}

/**
 * 写入已有日记时的并发表态。两种写法，必须选一种，没有第三种。
 *
 * <pre>
 * { expectedRevision: 7 }   基于第 7 版改的，服务端那边不是 7 就拒绝
 * { force: true }           我知道会盖掉别人的改动，照写
 * </pre>
 *
 * 后端两样都没有时直接 400。以前这里是 `expectedRevision?: number | null`，
 * 漏传能编译通过，要等运行时才收到那个 400——而这类接口大概率是由 AI 助手接着改的，
 * 编译期报错比线上 400 便宜得多。写成联合类型之后，「安全写入」和「强制覆盖」
 * 在类型上就是两件不同的事，也没法半推半就地都不写。
 */
export type RevisionGuard =
  | { expectedRevision: number, force?: false }
  | { force: true, expectedRevision?: never }

/** 新建日记：服务端还没有这一篇，无从谈起版本号。 */
export type JournalCreateRequest = JournalFields

/** 更新已有日记。字段全都必填，校验标准比草稿严，并且必须表态并发协议。 */
export type JournalUpdateRequest = JournalFields & RevisionGuard

/**
 * 自动保存：字段全部可选，缺席的沿用库里的旧值；并发表态照样一个都不能少。
 *
 * `detachFromTrip` 是明确解除旅行归属的标记——tripId 缺席意味着「不改」，
 * 光靠它表达不出「我要把这篇从旅行里摘出来」。
 */
export type JournalDraftPatchRequest = Partial<JournalFields> & RevisionGuard & {
  detachFromTrip?: boolean
}

/** 开一篇空草稿。字段都能缺席；新建页要等真的写了内容才会调它。 */
export interface JournalDraftInit {
  tripId?: number | null
  tripStopId?: number | null
  occurredOn?: LocalDateString | null
}

export interface TagView {
  id: number
  name: string
  slug: string
  journalCount: number
}

/** 预览链接。每次签发都会作废这篇日记之前的令牌。 */
export interface PreviewLink {
  token: string
  url: string
  expiresAt: IsoDateTimeString
}
