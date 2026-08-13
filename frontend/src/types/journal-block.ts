/**
 * 日记正文的 Block 模型。
 *
 * `journal_entry.content_json` 里的这份结构是正文的唯一数据源——不存在第二份
 * Markdown 或 HTML，渲染和编辑都从它出发。
 */

/** Block 的业务数据。字段随类型而变，读取时逐个收窄，不做联合类型穷举。 */
export type BlockData = Record<string, unknown>

/** Block 的表现设置。尺寸、对齐、画廊布局这些。 */
export type BlockSettings = Record<string, unknown>

export interface JournalBlock {
  id: string
  type: string
  version: number
  title: string
  data: BlockData
  settings: BlockSettings
}

export interface JournalDocument {
  schemaVersion: 1
  blocks: JournalBlock[]
}

/** Block 选择面板里的一项。 */
export interface CatalogEntry {
  type: string
  label: string
  /** 单个汉字或符号，面板上当图标用。 */
  icon: string
  category: string
  description: string
}

/** 创建 Block 时的初始值。可以直接给 data，也可以连 title / settings 一起给。 */
export interface BlockInitial {
  title?: string
  data?: BlockData
  settings?: BlockSettings
  [key: string]: unknown
}

/** 渲染时用来把 mediaId 换成真实地址的媒体条目。 */
export interface RenderableMedia {
  id: number
  displayUrl?: string
  caption?: string | null
}

/** 模板定义里的一项，sampleDocument 据此生成预览用的示例正文。 */
export interface SampleDefinition {
  type: string
  title?: string
  config?: { max?: number; [key: string]: unknown }
}
