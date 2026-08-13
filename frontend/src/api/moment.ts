import { del, get, post, put, upload, withParams } from './client'
import type { LocalDateString } from '@/types/common'
import type { MediaView } from '@/types/media'
import type {
  ComposeRequest,
  ComposeResult,
  MomentRequest,
  MomentView,
  RoutePoint,
} from '@/types/moment'

export const momentApi = {
  list: (tripId: number, day?: LocalDateString | null, unsorted?: boolean) =>
    get<MomentView[]>('/admin/moments', withParams({ tripId, day, unsorted })),

  get: (id: number) => get<MomentView>('/admin/moments/' + id),

  /** 每天还有多少条没整理，键是 `YYYY-MM-DD`。日历上的小红点用它。 */
  unsortedCount: (tripId: number) =>
    get<Record<LocalDateString, number>>('/admin/moments/unsorted-count', withParams({ tripId })),

  create: (body: MomentRequest) => post<MomentView>('/admin/moments', body),

  update: (id: number, body: MomentRequest) => put<MomentView>('/admin/moments/' + id, body),

  remove: (id: number) => del<void>('/admin/moments/' + id),

  /** clientId 让离线补传具备幂等性：同一张照片重传不会在服务端多出一条。 */
  addPhoto: (id: number, form: FormData, clientId?: string) =>
    upload<MediaView>('/admin/moments/' + id + '/media', form, {
      params: clientId ? { clientId } : {},
      timeout: 120_000,
    }),

  removePhoto: (id: number, mediaId: number) =>
    del<void>('/admin/moments/' + id + '/media/' + mediaId),

  route: (tripId: number, day?: LocalDateString | null) =>
    get<RoutePoint[]>('/admin/moments/route', withParams({ tripId, day })),

  /** AI 润色是否可用（取决于服务端有没有配 key）；不可用时前端不显示那个选项。 */
  aiStatus: () => get<{ available: boolean }>('/admin/moments/ai-status'),

  /** 把一天的随手记整理成日记草稿。replace 为空表示追加，不会冲掉已经写好的部分。 */
  compose: (body: ComposeRequest) => post<ComposeResult>('/admin/moments/compose', body),
}
