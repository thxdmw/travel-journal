import type { IsoDateTimeString, LocalDateString } from './common'
import type { JournalStatus } from './journal'

/** 后台首页最近编辑列表里的一行，对应 `DashboardService.RecentJournal`。 */
export interface RecentJournal {
  id: number
  title: string | null
  /** 所属旅行标题；独立日记或旅行已删除时为 null。 */
  tripTitle: string | null
  occurredOn: LocalDateString | null
  status: JournalStatus
  updatedAt: IsoDateTimeString
}

/** 后台首页概览，对应 `DashboardService.DashboardView`。 */
export interface DashboardView {
  trips: number
  drafts: number
  published: number
  /** 当前实际生效的全站主题名，不是写死的文案。 */
  themeName: string
  recent: RecentJournal[]
}
