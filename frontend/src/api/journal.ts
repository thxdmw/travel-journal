import { del, get, patch, post, put, withParams } from './client'
import type { PageResponse } from '@/types/common'
import type {
  JournalCreateRequest,
  JournalDraftInit,
  JournalDraftPatchRequest,
  JournalEntry,
  JournalUpdateRequest,
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

  create: (body: JournalCreateRequest) => post<JournalEntry>('/admin/journals', body),

  update: (id: number, body: JournalUpdateRequest) => put<JournalEntry>('/admin/journals/' + id, body),

  /**
   * 开一篇空草稿。
   *
   * 新建页不会一进来就调它：先在本地攒草稿，写了点什么才落服务端，
   * 免得「点进去看一眼就退出」留下空记录。
   */
  createDraft: (body?: JournalDraftInit) => post<JournalEntry>('/admin/journals/draft', body ?? {}),

  /** 自动保存：字段可以不全，后端按草稿标准校验（允许空标题、空正文）。 */
  saveDraft: (id: number, body: JournalDraftPatchRequest) =>
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

  /*
   * 发布和撤回也要带版本号，而且是必填。
   *
   * 状态转换以前完全在乐观锁之外：不看版本也不递增版本，于是一次并发的自动保存能拿着
   * 「发布前」的版本号照样匹配成功，把刚发布的文章连同发布时间一起写回草稿。正文保存和
   * 状态转换必须用同一套并发协议。
   *
   * 类型上写成必填而不是可选：后端缺了它直接 400，可选的话漏传要等到运行时才暴露。
   * 这类接口以后大概率是由 AI 助手接着改的，编译期报错比线上 400 便宜得多。
   */
  publish: (id: number, expectedRevision: number) =>
    post<JournalEntry>('/admin/journals/' + id + '/publish', { expectedRevision }),

  unpublish: (id: number, expectedRevision: number) =>
    post<JournalEntry>('/admin/journals/' + id + '/unpublish', { expectedRevision }),

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
