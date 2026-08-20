import { describe, expect, it } from 'vitest'
import { normalize } from '@/journal/document'
import type { BlockSettings } from '@/types/journal-block'

/*
 * 下线版式的搬运。
 *
 * 通栏出血、瀑布流那一批版式和整个色调设置撤掉之后，对应的 CSS 也删了。库里的老正文由
 * Flyway 迁移搬过一次，但作者浏览器 IndexedDB 里的本机草稿快照迁移够不着——它是从
 * normalize() 这条路回到编辑器的，所以搬运必须在这里发生，否则那些区块会落进
 * 「设置面板一个选项都不高亮、渲染又什么都不套」的空档。
 */
function settingsOf(settings: Record<string, unknown>): BlockSettings {
  const document = { schemaVersion: 1, blocks: [{ id: 'block_retired', type: 'gallery', version: 1, data: {}, settings }] }
  const [block] = normalize(document).blocks
  if (!block) throw new Error('normalize 没有产出区块')
  return block.settings
}

describe('normalize 搬运下线的图片设置', () => {
  it('把旧的宽度、排版、相框和图注位置换成保留集合里的值', () => {
    const settings = settingsOf({ size: 'bleed', layout: 'masonry', frame: 'polaroid', captionPos: 'overlay' })

    expect(settings.size).toBe('full')
    expect(settings.layout).toBe('grid')
    expect(settings.frame).toBe('none')
    expect(settings.captionPos).toBe('')
  })

  it('杂志版归到主图拼贴，故事流和错落画廊归到规则网格', () => {
    expect(settingsOf({ layout: 'magazine' }).layout).toBe('mosaic')
    expect(settingsOf({ layout: 'story' }).layout).toBe('grid')
    expect(settingsOf({ layout: 'staggered' }).layout).toBe('grid')
  })

  it('色调整项下线，直接删掉而不是留一个空值', () => {
    expect('tone' in settingsOf({ tone: 'vintage' })).toBe(false)
  })

  it('保留集合里的值原样不动', () => {
    expect(settingsOf({ size: 'large', layout: 'carousel', frame: 'film', captionPos: 'side' }))
      .toMatchObject({ size: 'large', layout: 'carousel', frame: 'film', captionPos: 'side' })
  })
})
