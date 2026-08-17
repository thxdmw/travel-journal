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

/** 发布日记的请求体。字段全都必填，校验标准比草稿严。 */
export interface JournalRequest {
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
  /**
   * 手里这份的版本号。更新已有日记时必填——服务端靠它分辨「基于最新内容的保存」
   * 和「绕远路才到的旧请求」，缺席会被 400 挡下来（新建时不需要）。
   */
  expectedRevision?: number | null
  /** 明确放弃并发保护、无条件覆盖服务端那一份。正常编辑流程不该用到。 */
  force?: boolean
}

/** 自动保存的请求体：字段全部可选，缺席的沿用库里的旧值。 */
export type JournalDraftRequest = Partial<JournalRequest>

/**
 * 明确解除旅行归属时草稿接口需要额外携带此标记。
 *
 * `expectedRevision` 是并发保护：带上手里这份的版本号，服务端才分得清
 * 「基于最新内容的保存」和「绕远路才到的旧请求」，后者会被 409 挡下来。
 */
export type JournalEditorDraftRequest = JournalDraftRequest & {
  detachFromTrip?: boolean
  expectedRevision?: number | null
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
