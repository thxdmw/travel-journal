import type { AxiosProgressEvent } from 'axios'
import { del, get, patch, put, upload } from './client'
import type { MediaView } from '@/types/media'

/** 由 EXIF GPS 推出的拍摄城市，用于提示作者「这篇是不是在这里写的」。 */
export interface CitySuggestion {
  tripStopId: number | null
  cityName: string | null
  distanceKm: number
  photoCount: number
}

/** journal_media 关系记录。改说明后回传，前端只用到 caption。 */
/** 设封面的结果，对应 `MediaController.CoverResult`。 */
export interface CoverResult {
  coverMediaId: number
  /** 写入之后的日记版本号，编辑器必须拿它更新手上那份。 */
  revision: number
}

/** 删图的结果，对应 `MediaController.DeleteResult`。 */
export interface DeleteResult {
  /** 删除之后的日记版本号；删的是封面时会比删之前大 1。 */
  revision: number
}

export interface JournalMediaRelation {
  id: number
  journalId: number
  mediaId: number
  caption: string | null
  sortOrder: number | null
}

export const mediaApi = {
  list: (journalId: number) => get<MediaView[]>('/admin/journals/' + journalId + '/media'),

  /*
   * onUploadProgress 用来在正文的占位图上显示单张进度：旅行时一次传十几张，
   * 没有进度就只剩一个转圈，分不清是卡住了还是在传。
   * 超时放宽到 120 秒，手机上传原图很容易超过默认的 30 秒。
   */
  upload: (
    journalId: number,
    form: FormData,
    onUploadProgress?: (event: AxiosProgressEvent) => void,
  ) =>
    upload<MediaView>('/admin/journals/' + journalId + '/media', form, {
      timeout: 120_000,
      onUploadProgress,
    }),

  /** 按 EXIF 拍摄时间重排，返回排了多少张。没有 EXIF 的排在最后。 */
  sortByCaptureTime: (journalId: number) =>
    put<number>('/admin/journals/' + journalId + '/media/sort-by-capture-time'),

  suggestCity: (journalId: number) =>
    get<CitySuggestion>('/admin/journals/' + journalId + '/media/suggest-city'),

  /*
   * 设封面。
   *
   * 封面是日记聚合的一次改动，会推进 revision，所以两头都要带上版本号：请求里带手上
   * 这份的，响应里拿写入之后的。少了回写那一步，作者设完封面继续打字，下一次自动保存
   * 就会拿着过期的版本号和自己刚才这一下撞成 409。
   *
   * expectedRevision 是必填：漏传在后端会得到 400，让它在编译期就过不去。
   */
  setCover: (journalId: number, mediaId: number, expectedRevision: number) =>
    patch<CoverResult>('/admin/journals/' + journalId + '/cover/' + mediaId, { expectedRevision }),

  /** orderedIds 传的是 journal_media 关系 id，且必须是该日记的全部图片，少一张后端就 400。 */
  reorder: (journalId: number, orderedIds: number[]) =>
    put<void>('/admin/journals/' + journalId + '/media/reorder', { orderedIds }),

  updateCaption: (relationId: number, caption: string) =>
    put<JournalMediaRelation>('/admin/journal-media/' + relationId, { caption }),

  /*
   * 删图。
   *
   * 删的如果正是封面，服务端会清空封面并推进 revision，所以这里和 setCover 一样要把
   * 新版本号接回来——即使删的不是封面，返回的也是当前版本号，直接赋值总是对的。
   */
  remove: (relationId: number) => del<DeleteResult>('/admin/journal-media/' + relationId),
}
