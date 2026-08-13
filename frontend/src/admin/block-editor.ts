import type { JournalDocument } from '@/types/journal-block'

export interface BlockUpload {
  key: string
  name: string
  preview: string
  progress: number
  status: 'waiting' | 'uploading' | 'done' | 'failed'
}

export interface BlockEditorHandle {
  openCatalog(): void
  insertMedia(ids: number | number[], preferredType?: string): void
  insertQuick(type: string): void
  insertPending(items: BlockUpload[]): void
  resolvePending(key: string, mediaId: number): void
  dropPending(key: string): void
  flushInline(): void
}

export type { JournalDocument }
