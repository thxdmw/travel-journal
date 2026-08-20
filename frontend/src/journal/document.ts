import { BLOCK_DEFAULTS, MEDIA_BLOCK_TYPES } from './catalog'
import { rec } from './escape'
import type {
  BlockInitial,
  BlockSettings,
  JournalBlock,
  JournalDocument,
} from '@/types/journal-block'

/** 深拷贝。默认值和已有内容都必须拷一份，否则多个 Block 会共享同一个数组。 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function emptyDocument(): JournalDocument {
  return { schemaVersion: 1, blocks: [] }
}

/** Block id。时间戳保证大致有序，随机段避免同一毫秒内连开两个撞号。 */
export function blockId(): string {
  return 'block_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

function mediaSettings(type: string): BlockSettings {
  return {
    size: type === 'postcard' ? 'medium' : '',
    align: 'center',
    layout: type === 'postcard' ? 'postcard' : '',
    columns: null,
    ratio: '',
    focus: '',
    frame: '',
    radius: '',
    effect: '',
    captionPos: '',
  }
}

export function createBlock(type: string, initial?: BlockInitial | null): JournalBlock {
  const block: JournalBlock = {
    id: blockId(),
    type,
    version: 1,
    title: '',
    data: clone(BLOCK_DEFAULTS[type] ?? {}),
    settings: {},
  }
  if ((MEDIA_BLOCK_TYPES as readonly string[]).includes(type)) {
    block.settings = mediaSettings(type)
  }
  if (type === 'paragraph') block.settings = { style: 'normal', align: 'left' }
  if (initial) {
    if (initial.title) block.title = initial.title
    // 没给 data 时把 initial 整体当作 data，模板生成走的就是这条路
    Object.assign(block.data, initial.data ?? initial)
    Object.assign(block.settings, initial.settings ?? {})
  }
  return block
}

/**
 * 已经下线的图片设置值 → 保留集合里的替代值。
 *
 * 通栏出血、瀑布流那一批版式、除胶带和胶片以外的相框、以及整个色调设置在这一版撤掉了，
 * 对应的 CSS 也一并删了。老正文仍然带着旧值——库里的会由 Flyway 迁移搬一次，但浏览器
 * IndexedDB 里的本机草稿快照迁移够不着，不在这里搬就会落进「设置面板一个选项都不高亮、
 * 渲染又什么都不套」的空档。这张表和后端 JournalDocumentService 的那份一一对应，
 * 两边必须同时改。
 */
const RETIRED_SETTING_VALUES: Record<string, Record<string, string>> = {
  size: { bleed: 'full' },
  layout: { masonry: 'grid', story: 'grid', staggered: 'grid', magazine: 'mosaic' },
  frame: { line: 'none', paper: 'none', float: 'none', polaroid: 'none', postcard: 'none' },
  captionPos: { overlay: '' },
}
/** 整项下线的设置，直接删掉。 */
const RETIRED_SETTING_KEYS = ['tone']

function migrateRetiredSettings(settings: BlockSettings): BlockSettings {
  for (const key of RETIRED_SETTING_KEYS) delete settings[key]
  for (const [key, mapping] of Object.entries(RETIRED_SETTING_VALUES)) {
    const value = settings[key]
    if (typeof value === 'string' && value in mapping) settings[key] = mapping[value]
  }
  return settings
}

/**
 * 把任意来源的正文归一成标准结构。
 *
 * 每个 Block 都先按类型建一份带默认值的骨架，再把已有的 data / settings 盖上去。
 * 这样后来给某个类型新增的字段，老日记打开时会自动补上默认值，而不是 undefined。
 */
export function normalize(source: unknown): JournalDocument {
  const document = rec(source)
  if (!Array.isArray(document.blocks)) return emptyDocument()
  return {
    schemaVersion: 1,
    blocks: document.blocks.filter(Boolean).map(entry => {
      const item = rec(entry)
      const block = createBlock(typeof item.type === 'string' ? item.type : 'paragraph')
      block.id = typeof item.id === 'string' && item.id ? item.id : blockId()
      block.version = 1
      block.title = typeof item.title === 'string' ? item.title : ''
      block.data = Object.assign(block.data, clone(rec(item.data)))
      block.settings = migrateRetiredSettings(Object.assign(block.settings, clone(rec(item.settings))))
      return block
    }),
  }
}

/** 正文里的全部文字，用于搜索摘要和字数统计。 */
export function textContent(source: unknown): string {
  const values: string[] = []
  const visit = (value: unknown): void => {
    if (typeof value === 'string') values.push(value)
    else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') Object.values(value).forEach(visit)
  }
  for (const block of normalize(source).blocks) {
    if (block.title) values.push(block.title)
    visit(block.data)
  }
  return values.join(' ')
}

/** 字数。中文按字算，所以只是去掉空白后数长度，不做分词。 */
export function wordCount(source: unknown): number {
  return textContent(source).replace(/\s/g, '').length
}
