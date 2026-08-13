import { del, get, post, put, withParams } from './client'
import type { IsoDateTimeString, JsonObject, LocalDateString } from '@/types/common'

export interface JournalTemplate {
  id: number
  createdAt: IsoDateTimeString
  updatedAt: IsoDateTimeString
  name: string
  description: string | null
  category: string | null
  definitionJson: JsonObject
  version: number
  enabled: boolean
  builtin: boolean
}

export interface TemplateRequest {
  name: string
  description?: string
  category?: string
  definitionJson: JsonObject
  enabled?: boolean
}

export interface GenerateRequest {
  journalId?: number | null
  tripId: number
  tripStopId?: number | null
  occurredOn: LocalDateString
  /** 填进模板占位的数据。结构由模板的 definitionJson 决定。 */
  data?: JsonObject
}

/** 生成结果。`skippedBlocks` 是数据不全被跳过的块，编辑器会提示作者补。 */
export interface GenerateResult {
  contentJson: JsonObject
  templateId: number
  templateVersion: number
  skippedBlocks: string[]
}

export const templateApi = {
  list: (enabledOnly = false) =>
    get<JournalTemplate[]>('/admin/journal-templates', withParams({ enabledOnly })),

  get: (id: number) => get<JournalTemplate>('/admin/journal-templates/' + id),

  create: (body: TemplateRequest) => post<JournalTemplate>('/admin/journal-templates', body),

  update: (id: number, body: TemplateRequest) =>
    put<JournalTemplate>('/admin/journal-templates/' + id, body),

  remove: (id: number) => del<void>('/admin/journal-templates/' + id),

  duplicate: (id: number) => post<JournalTemplate>('/admin/journal-templates/' + id + '/duplicate'),

  generate: (id: number, body: GenerateRequest) =>
    post<GenerateResult>('/admin/journal-templates/' + id + '/generate', body),
}

/**
 * 备份走浏览器直接下载：文件可能很大（含全部原图），用 axios 收进内存再存盘没必要。
 * 返回的是地址，调用方自己 `location.href` 或建 `<a download>`。
 */
export const backupApi = {
  url: (includePhotos = true) => '/api/admin/backup?includePhotos=' + includePhotos,
}
