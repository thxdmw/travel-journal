import { get, seg, withParams } from './client'
import type { PageResponse } from '@/types/common'
import type { JournalCard, JournalDetail, TagView } from '@/types/journal'
import type { PublicProfile } from '@/types/auth'
import type { CityMarker, HomeView, TripCard, TripDetail, YearReview } from '@/types/public'

/** 公开站点的只读接口。全部无需登录。 */
export const publicApi = {
  home: () => get<HomeView>('/public/home'),

  trips: () => get<TripCard[]>('/public/trips'),

  trip: (slug: string) => get<TripDetail>('/public/trips/' + seg(slug)),

  journals: (page = 1, pageSize = 12, keyword?: string, tag?: string) =>
    get<PageResponse<JournalCard>>('/public/journals', withParams({ page, pageSize, keyword, tag })),

  tags: () => get<TagView[]>('/public/tags'),

  years: () => get<number[]>('/public/years'),

  yearReview: (year: number) => get<YearReview>('/public/years/' + year),

  journal: (slug: string) => get<JournalDetail>('/public/journals/' + seg(slug)),

  /** 未发布日记的预览。token 由后台签发，每次重新生成会作废上一个。 */
  preview: (token: string) => get<JournalDetail>('/public/preview/' + seg(token)),

  cities: () => get<CityMarker[]>('/public/map/cities'),

  /*
   * 带时间戳打断缓存：站长换了头像或主题之后，公开端必须立刻看到新的，
   * 而这个响应会被 Service Worker 的 stale-while-revalidate 命中旧值。
   */
  profile: () => get<PublicProfile>('/public/profile', withParams({ v: Date.now() })),
}
