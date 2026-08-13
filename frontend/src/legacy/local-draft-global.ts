/*
 * 迁移兼容层：本机草稿仓库。
 *
 * 消费方是尚未移除的后台兼容桥和
 * admin/moments.js——自动保存、离线拍照和离线随手记走的都是这一份。
 *
 * TODO(迁移): 消费方迁到 SFC 后改为直接 import @/draft/*，删除本文件。
 */
import { get, pointer, put, remove } from '@/draft/drafts'
import { dropPhoto, pendingPhotos, queuePhoto } from '@/draft/photos'
import {
  dropPendingMoment,
  pendingMoment,
  pendingMoments,
  queueMoment,
  updatePendingMoment,
} from '@/draft/moments'

const localDraft = {
  put,
  get,
  remove,
  pointer,
  queuePhoto,
  pendingPhotos,
  dropPhoto,
  queueMoment,
  pendingMoments,
  pendingMoment,
  updatePendingMoment,
  dropPendingMoment,
} as const

export type LocalDraftGlobal = typeof localDraft

declare global {
  interface Window {
    LocalDraft: LocalDraftGlobal
  }
}

window.LocalDraft = localDraft

export { localDraft }
