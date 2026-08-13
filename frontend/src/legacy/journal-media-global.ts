/*
 * 迁移兼容层：Block 图片组件的运行时增强。
 *
 * 消费方是尚未移除的后台兼容桥。
 * MEDIA_SELECTOR 是灯箱收图的唯一依据，被 admin/shared.js 直接读取。
 *
 * TODO(迁移): 消费方迁到 SFC 后改为直接 import @/media，删除本文件。
 */
import { enhance, teardown } from '@/media/enhance'
import { applyResponsiveImages } from '@/media/responsive'
import { MEDIA_SELECTOR, groupOf } from '@/media/selector'

const journalMedia = {
  applyResponsiveImages,
  enhance,
  teardown,
  groupOf,
  MEDIA_SELECTOR,
} as const

export type JournalMediaGlobal = typeof journalMedia

declare global {
  interface Window {
    JournalMedia: JournalMediaGlobal
  }
}

window.JournalMedia = journalMedia

export { journalMedia }
