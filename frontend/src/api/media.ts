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

  setCover: (journalId: number, mediaId: number) =>
    // 后端是 PATCH，返回 Void；成功与否看有没有抛错
    patch<void>('/admin/journals/' + journalId + '/cover/' + mediaId),

  /** orderedIds 传的是 journal_media 关系 id，且必须是该日记的全部图片，少一张后端就 400。 */
  reorder: (journalId: number, orderedIds: number[]) =>
    put<void>('/admin/journals/' + journalId + '/media/reorder', { orderedIds }),

  updateCaption: (relationId: number, caption: string) =>
    put<JournalMediaRelation>('/admin/journal-media/' + relationId, { caption }),

  remove: (relationId: number) => del<void>('/admin/journal-media/' + relationId),
}
