import { del, get, patch, post, put, withParams } from './client'
import type { PageResponse } from '@/types/common'
import type {
  JournalDraftInit,
  JournalDraftRequest,
  JournalEntry,
  JournalRequest,
  JournalStatus,
  PreviewLink,
  TagView,
} from '@/types/journal'

export interface JournalListParams {
  page?: number
  pageSize?: number
  keyword?: string
  status?: JournalStatus
  tripId?: number
}

export const journalApi = {
  list: (params?: JournalListParams) =>
    get<PageResponse<JournalEntry>>('/admin/journals', withParams({ ...params })),

  get: (id: number) => get<JournalEntry>('/admin/journals/' + id),

  create: (body: JournalRequest) => post<JournalEntry>('/admin/journals', body),

  update: (id: number, body: JournalRequest) => put<JournalEntry>('/admin/journals/' + id, body),

  /** 开一篇空草稿。编辑器一进页面就调，好让打字和拍照立刻有 id 可用。 */
  createDraft: (body?: JournalDraftInit) => post<JournalEntry>('/admin/journals/draft', body ?? {}),

  /** 自动保存：字段可以不全，后端按草稿标准校验（允许空标题、空正文）。 */
  saveDraft: (id: number, body: JournalDraftRequest) =>
    patch<JournalEntry>('/admin/journals/' + id + '/draft', body),

  /*
   * 作者显式放弃一篇空草稿时调用，是否真的删由后端判断。
   * 退出编辑器时不要自动调它——那一刻最后一次保存可能还在路上，看着空的未必真是空的；
   * 真正没人动过的空草稿由服务端满 24 小时后统一回收。
   */
  discardEmpty: (id: number) =>
    del<{ discarded: boolean }>('/admin/journals/' + id + '/discard-empty'),

  /** 删除日记及其全部图片，返回一并删掉的图片张数。 */
  remove: (id: number) => del<{ removedMedia: number }>('/admin/journals/' + id),

  /** 删除前调用，用于在确认弹窗里说明会连带删除多少张图。 */
  mediaCount: (id: number) => get<{ count: number }>('/admin/journals/' + id + '/media-count'),

  publish: (id: number) => post<JournalEntry>('/admin/journals/' + id + '/publish'),

  unpublish: (id: number) => post<JournalEntry>('/admin/journals/' + id + '/unpublish'),

  createPreviewLink: (id: number) => post<PreviewLink>('/admin/journals/' + id + '/preview-link'),

  revokePreviewLink: (id: number) => del<void>('/admin/journals/' + id + '/preview-link'),
}

export const journalTagApi = {
  list: () => get<TagView[]>('/admin/journals/tags'),

  /** 返回改名后的标签 id：重名会合并到已有标签，id 可能和传入的不同。 */
  rename: (tagId: number, name: string) => put<number>('/admin/journals/tags/' + tagId, { name }),

  merge: (sourceId: number, targetId: number) =>
    post<void>('/admin/journals/tags/' + sourceId + '/merge-into/' + targetId),

  remove: (tagId: number) => del<void>('/admin/journals/tags/' + tagId),

  /** 清理没有任何日记引用的标签，返回清掉的条数。 */
  purgeUnused: () => post<number>('/admin/journals/tags/purge-unused'),
}
