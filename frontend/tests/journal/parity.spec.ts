import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalize, textContent, wordCount } from '@/journal/document'
import { render, renderBlock } from '@/journal/render'
import { sampleDocument } from '@/journal/sample'
import { CATALOG } from '@/journal/catalog'
import type { JournalBlock, RenderableMedia } from '@/types/journal-block'

/*
 * 与迁移前实现的对拍。
 *
 * 这个模块有 30 种 Block，每种都是手写的 HTML 字符串拼接。逐条手写期望值几乎
 * 一定会漏掉某个分支，而漏掉的那条恰好就是线上会坏的那条。所以这里直接把迁移前
 * 的 js/common/journal-blocks.js 留作夹具，同样的输入喂给两份实现，逐字节比对。
 *
 * 夹具是历史快照，不参与运行，也不要跟着新需求改——它的价值就在于「没被改过」。
 * 等这一版在线上稳定一段时间之后可以连同本文件一起删掉。
 */

interface LegacyApi {
  render(document: unknown, media?: unknown): string
  renderBlock(block: unknown, media?: unknown): string
  normalize(document: unknown): { schemaVersion: number; blocks: unknown[] }
  wordCount(document: unknown): number
  textContent(document: unknown): string
  sampleDocument(definitions: unknown): { schemaVersion: number; blocks: unknown[] }
  CATALOG: { type: string }[]
}

function loadLegacy(): LegacyApi {
  // 从工作目录解析：jsdom 环境下 import.meta.url 不是 file: scheme
  const source = readFileSync(resolve('tests/fixtures/legacy-journal-blocks.js'), 'utf8')
  const host: { JournalBlocks?: LegacyApi } = {}
  // 夹具是 IIFE，执行后把接口挂到传进去的 window 上
  new Function('window', source)(host)
  if (!host.JournalBlocks) throw new Error('夹具没有建立 JournalBlocks')
  return host.JournalBlocks
}

const legacy = loadLegacy()

const MEDIA: RenderableMedia[] = [
  { id: 11, displayUrl: '/api/media/11/display', caption: '山门' },
  { id: 12, displayUrl: 'https://cdn.test/12.jpg', caption: null },
]

interface Case {
  type: string
  title?: string
  data?: Record<string, unknown>
  settings?: Record<string, unknown>
}

/** 每种类型一份有代表性的数据，尽量把可选分支都点到。键只是用例名。 */
const CASES: Record<string, Case> = {
  标题: { type: 'heading', data: { text: '第一天', level: 3 } },
  标题越界层级: { type: 'heading', data: { text: 'x', level: 9 } },
  标题层级为零: { type: 'heading', data: { text: 'x', level: 0 } },
  段落: { type: 'paragraph', data: { text: '第一行\n第二行' }, settings: { style: 'lead', align: 'center' } },
  段落空设置: { type: 'paragraph', data: { text: '只有文字' }, settings: {} },
  段落带标题: { type: 'paragraph', title: '小节', data: { text: 'x' } },
  引用: { type: 'quote', data: { text: '慢下来', source: '手记' } },
  引用无出处: { type: 'quote', data: { text: '慢下来' } },
  提示卡片: { type: 'callout', data: { tone: 'memory', icon: '✦', text: '风' } },
  提示卡片默认语气: { type: 'callout', data: { text: '风' } },
  信息清单: { type: 'facts', data: { items: [{ label: '门票', value: '80\n元' }] } },
  优缺点: { type: 'pros-cons', data: { pros: ['安静'], cons: ['人多'] } },
  表格: { type: 'table', data: { headers: ['项目', '内容'], rows: [['门票', '80'], ['用时']] } },
  表格单元格为零: { type: 'table', data: { headers: ['a'], rows: [[0]] } },
  链接卡片: { type: 'link-card', data: { url: 'https://example.com', title: '攻略', description: '参考' } },
  链接卡片无标题: { type: 'link-card', data: { url: 'https://example.com' } },
  评分: { type: 'rating', data: { score: 4, max: 5, comment: '值得' } },
  评分越界: { type: 'rating', data: { score: 99, max: 5 } },
  评分为零: { type: 'rating', data: { score: 0, max: 5 } },
  清单: { type: 'checklist', data: { items: [{ text: '看日落', checked: true }, { text: '寄卡', checked: false }] } },
  数字亮点: { type: 'stats', data: { items: [{ value: '18,642', label: '步' }] } },
  同行的人: { type: 'companions', data: { items: [{ name: '小满', role: '旅伴', note: '爱吃' }] } },
  同行的人仅姓名: { type: 'companions', data: { items: [{ name: '小满' }] } },
  旅行信息: { type: 'trip-info', data: { date: '2026-08-09', city: '成都', weather: '晴' } },
  路线: { type: 'route', data: { items: ['成都', '青城山'] } },
  行程: { type: 'itinerary', data: { items: [{ time: '09:30', title: '山门', address: '景区' }] } },
  时间线: { type: 'timeline', data: { items: [{ time: '09:30', title: '出发', description: '天亮了' }] } },
  花费: { type: 'expense-summary', data: { currency: 'CNY', total: 268, categories: [{ name: '交通', amount: 88 }] } },
  花费无币种: { type: 'expense-summary', data: { total: 0, categories: [{ name: '交通', amount: 0 }] } },
  地点卡片: { type: 'location-card', data: { name: '青城山', address: '都江堰', hours: '08:00', cost: '80', impression: '好' } },
  地点卡片仅名字: { type: 'location-card', data: { name: '青城山' } },
  美食: { type: 'food', data: { dish: '腊肉', restaurant: '小馆', price: '68', rating: 4, note: '香' } },
  美食无评分: { type: 'food', data: { dish: '腊肉', restaurant: '小馆' } },
  住宿: { type: 'stay', data: { name: '民宿', room: '大床', nights: 2, rating: 5, note: '静' } },
  住宿晚数为零: { type: 'stay', data: { name: '民宿', nights: 0 } },
  交通: { type: 'transport', data: { mode: '高铁', from: 'A', to: 'B', number: 'C1', duration: '30 分' } },
  交通无班次: { type: 'transport', data: { from: 'A', to: 'B' } },
  天气: { type: 'weather', data: { condition: '晴', temperature: '26', feelsLike: '25', wind: '微风', note: '凉快' } },
  天气仅状况: { type: 'weather', data: { condition: '晴' } },
  今日开场: {
    type: 'day-opener',
    data: {
      city: '东京',
      dayLabel: 'Day 4',
      date: '2026-08-10',
      weather: '晴',
      route: ['浅草', '上野'],
      metrics: [{ value: '21,430', label: '步' }],
    },
  },
  今日开场半填: { type: 'day-opener', data: { city: '东京' } },
  今日开场空: { type: 'day-opener', data: {} },
  章节节点: { type: 'chapter', data: { time: '09:00', title: '清晨', note: '安静' } },
  今日小结: { type: 'day-summary', data: { items: [{ icon: '🌟', label: '最喜欢', value: '风' }, { label: '', value: '' }] } },
  单图: { type: 'image', data: { mediaId: 11, caption: '山门' }, settings: { size: 'large', align: 'center', ratio: '4:3' } },
  单图无设置: { type: 'image', data: { mediaId: 12 }, settings: {} },
  单图用媒体说明兜底: { type: 'image', data: { mediaId: 11 }, settings: {} },
  单图预览地址: { type: 'image', data: { previewUrl: 'blob:x', caption: '预览' }, settings: {} },
  单图空: { type: 'image', data: {}, settings: {} },
  图片组: { type: 'gallery', data: { mediaIds: [11, 12], caption: '照片' }, settings: { layout: 'grid', columns: 3 } },
  图片组对比模式: { type: 'gallery', data: { mediaIds: [11, 12, 11] }, settings: { layout: 'compare' } },
  图片组列数越界: { type: 'gallery', data: { mediaIds: [11] }, settings: { columns: 99 } },
  图片组预览地址: { type: 'gallery', data: { previewUrls: ['blob:a', 'blob:b'] }, settings: {} },
  图片组空: { type: 'gallery', data: {}, settings: {} },
  明信片: {
    type: 'postcard',
    data: { mediaId: 11, location: '成都', date: '2026-08-09', message: '你好\n世界', signature: '手记' },
  },
  明信片无图: { type: 'postcard', data: { location: '成都', message: '你好' } },
  分隔线: { type: 'divider', data: {} },
  未知类型: { type: 'nope', data: {} },
}

/** 用固定 id 建块，避免随机 id 让两边输出不同。 */
function blockOf(name: string): JournalBlock {
  const entry = CASES[name]
  if (!entry) throw new Error('没有这个用例：' + name)
  return {
    id: 'block_fixed',
    type: entry.type,
    version: 1,
    title: entry.title ?? '',
    data: entry.data ?? {},
    settings: entry.settings ?? {},
  }
}

const ALL_CASES = Object.keys(CASES)

describe('renderBlock 与迁移前实现逐字节一致', () => {
  for (const name of ALL_CASES) {
    it(name, () => {
      const block = blockOf(name)
      expect(renderBlock(block, MEDIA)).toBe(legacy.renderBlock(block, MEDIA))
    })
  }
})

describe('整篇渲染一致', () => {
  const document = { schemaVersion: 1, blocks: ALL_CASES.map(blockOf) }

  it('多种 Block 混排', () => {
    expect(render(document, MEDIA)).toBe(legacy.render(document, MEDIA))
  })

  it('空文档与坏输入', () => {
    for (const input of [null, undefined, {}, { blocks: null }, { blocks: [] }, 'x', 42]) {
      expect(render(input, MEDIA), String(input)).toBe(legacy.render(input, MEDIA))
    }
  })

  it('不传媒体时按 id 拼站内地址', () => {
    const withImages = { schemaVersion: 1, blocks: [blockOf('单图'), blockOf('图片组')] }
    expect(render(withImages)).toBe(legacy.render(withImages))
  })

  it('textContent 一致', () => {
    expect(textContent(document)).toBe(legacy.textContent(document))
  })

  it('wordCount 一致且不为零', () => {
    expect(wordCount(document)).toBe(legacy.wordCount(document))
    expect(wordCount(document)).toBeGreaterThan(0)
  })
})

describe('normalize 一致', () => {
  /** id 是随机生成的，比较结构时抹掉。 */
  const strip = (document: { blocks: unknown[] }) =>
    document.blocks.map(block => ({ ...(block as Record<string, unknown>), id: '' }))

  it('补齐默认值并保留已有内容', () => {
    const source = { blocks: [{ type: 'food', data: { dish: '腊肉' } }, { type: 'divider' }] }
    expect(strip(normalize(source))).toEqual(strip(legacy.normalize(source)))
  })

  it('全类型往返后结构相同', () => {
    const source = { blocks: ALL_CASES.map(blockOf) }
    expect(strip(normalize(source))).toEqual(strip(legacy.normalize(source)))
  })

  it('坏输入退回空文档', () => {
    for (const input of [null, undefined, {}, { blocks: 'x' }, 42]) {
      expect(normalize(input), String(input)).toEqual(legacy.normalize(input))
    }
  })

  it('过滤掉数组里的空洞', () => {
    const source = { blocks: [null, { type: 'divider' }, undefined] }
    expect(normalize(source).blocks).toHaveLength(legacy.normalize(source).blocks.length)
  })
})

describe('目录与示例文档一致', () => {
  it('CATALOG 逐项相同', () => {
    expect(CATALOG).toEqual(legacy.CATALOG)
  })

  it('sampleDocument 渲染结果相同', () => {
    const definitions = [
      { type: 'trip-info', title: '今天' },
      { type: 'text' },
      { type: 'textarea' },
      { type: 'rating', config: { max: 10 } },
      { type: 'image' },
      { type: 'gallery' },
      { type: 'postcard' },
      { type: 'divider' },
      { type: 'checklist' },
      { type: 'table' },
    ]
    // block id 每次都是新随机值，比内容之前先抹掉
    const anonymize = (html: string) => html.replace(/data-block-id="[^"]*"/g, 'data-block-id=""')
    expect(anonymize(render(sampleDocument(definitions)))).toBe(
      anonymize(legacy.render(legacy.sampleDocument(definitions))),
    )
  })
})
