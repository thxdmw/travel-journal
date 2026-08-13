/*
 * 迁移兼容层：把 TS Block 模块重新拼成旧的 `window.JournalBlocks` 形状。
 *
 * 消费方是 public-app.js、admin/journal-editor.js、common/journal-block-editor.js
 * 和 admin/studio.js——公开端渲染正文、编辑器建块和实时预览走的都是这一份。
 *
 * TODO(迁移): 每有一个消费方迁到 SFC，就让它直接从 @/journal 导入；
 * 全部迁完后删除本文件，不保留 window 全局。
 */
import { CATALOG } from '@/journal/catalog'
import { createBlock, emptyDocument, normalize, textContent, wordCount } from '@/journal/document'
import { render, renderBlock } from '@/journal/render'
import { sampleDocument } from '@/journal/sample'

const journalBlocks = {
  // 旧代码拿到的是普通数组，保持可变形态以免某处排序或 filter 之外的用法突然报错
  CATALOG: [...CATALOG],
  emptyDocument,
  normalize,
  createBlock,
  render,
  renderBlock,
  wordCount,
  textContent,
  sampleDocument,
} as const

export type JournalBlocksGlobal = typeof journalBlocks

declare global {
  interface Window {
    JournalBlocks: JournalBlocksGlobal
  }
}

window.JournalBlocks = journalBlocks

export { journalBlocks }
