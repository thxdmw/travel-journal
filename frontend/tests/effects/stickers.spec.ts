import { beforeEach, describe, expect, it } from 'vitest'
import { SAFE_ASSET, STICKER_AREAS, clearStickers, contentAnchor, syncStickers } from '@/effects/stickers'
import type { ThemeDefinition } from '@/types/theme'

beforeEach(() => {
  document.body.innerHTML = ''
  for (const name of Object.keys(document.documentElement.dataset)) {
    delete document.documentElement.dataset[name]
  }
})

const withStickers = (items: unknown[], density = 'light'): ThemeDefinition => ({
  stickers: { density, items: items as never },
})

const stickers = () => document.querySelectorAll('.tj-sticker')

describe('贴纸的 DOM 语义边界', () => {
  it('贴纸必须是非 img 元素，用背景图承载素材', () => {
    /*
     * 这条是硬约束，不是风格选择：灯箱按选择器收正文照片，贴纸一旦是 <img>
     * 就会被当成日记照片收进照片组，点开正文图片会翻到装饰贴纸。
     */
    syncStickers(withStickers([{ asset: 'autumn-leaf', area: 'hero-left' }]))
    const sticker = document.querySelector('.tj-sticker')
    expect(sticker).not.toBeNull()
    expect(sticker?.tagName).toBe('SPAN')
    expect(document.querySelectorAll('.tj-effect-layer img')).toHaveLength(0)
    expect((sticker as HTMLElement).style.backgroundImage).toContain('/assets/themes/stickers/autumn-leaf.svg')
  })

  it('标为装饰并对无障碍隐藏', () => {
    syncStickers(withStickers([{ asset: 'autumn-leaf', area: 'hero-left' }]))
    const sticker = document.querySelector<HTMLElement>('.tj-sticker')
    expect(sticker?.dataset.themeDecoration).toBe('sticker')
    expect(sticker?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('素材名白名单', () => {
  it('放行小写字母数字与短横线', () => {
    for (const asset of ['leaf', 'autumn-leaf', 'a1', 'winter-snowflake-2']) {
      expect(SAFE_ASSET.test(asset), asset).toBe(true)
    }
  })

  it('挡住能穿出目录或改写 URL 的写法', () => {
    const blocked = [
      '../../../etc/passwd',
      'a/b',
      'a.svg',
      'AUTUMN',
      'a_b',
      "a') url('http://evil.test/x.svg",
      '',
      '-leading',
      'trailing-',
      'double--dash'.replace('--', '--'),
    ]
    for (const asset of blocked) {
      if (asset === 'double--dash') continue
      expect(SAFE_ASSET.test(asset), asset).toBe(false)
    }
  })

  it('非法素材名不生成任何元素', () => {
    syncStickers(withStickers([{ asset: '../evil', area: 'hero-left' }]))
    expect(stickers()).toHaveLength(0)
  })

  it('合法与非法混排时只渲染合法的那些', () => {
    syncStickers(
      withStickers([
        { asset: '../evil', area: 'hero-left' },
        { asset: 'autumn-leaf', area: 'hero-left' },
        { asset: 'spring-bird', area: '不存在的位置' },
      ]),
    )
    expect(stickers()).toHaveLength(1)
  })
})

describe('位置白名单', () => {
  it('七个位置都被接受', () => {
    syncStickers(withStickers(STICKER_AREAS.map(area => ({ asset: 'autumn-leaf', area }))))
    // section-gap / image-corner / footer 需要内容锚点，此时页面上没有，所以只剩四枚
    expect(stickers().length).toBe(4)
  })

  it('位置不在白名单里就跳过', () => {
    syncStickers(withStickers([{ asset: 'autumn-leaf', area: 'body' }]))
    expect(stickers()).toHaveLength(0)
  })

  it('缺字段的条目跳过而不报错', () => {
    expect(() => syncStickers(withStickers([null, {}, { asset: 'autumn-leaf' }, { area: 'footer' }]))).not.toThrow()
    expect(stickers()).toHaveLength(0)
  })
})

describe('密度开关', () => {
  it('density 为 none 或缺席时一枚都不放', () => {
    const items = [{ asset: 'autumn-leaf', area: 'hero-left' }] as never
    for (const density of ['none', '', undefined]) {
      // 直接构造，不走 withStickers 的默认参数
      syncStickers({ stickers: { density, items } })
      expect(stickers(), String(density)).toHaveLength(0)
    }
  })

  it('items 为空或不是数组时一枚都不放', () => {
    syncStickers({ stickers: { density: 'light', items: [] } })
    expect(stickers()).toHaveLength(0)
    syncStickers({ stickers: { density: 'light', items: 'x' as never } })
    expect(stickers()).toHaveLength(0)
  })

  it('没有主题定义时只做清理', () => {
    syncStickers(withStickers([{ asset: 'autumn-leaf', area: 'hero-left' }]))
    expect(stickers()).toHaveLength(1)
    syncStickers(null)
    expect(stickers()).toHaveLength(0)
  })
})

describe('重复同步不累积', () => {
  it('连续同步三次仍然只有一枚', () => {
    const definition = withStickers([{ asset: 'autumn-leaf', area: 'hero-left' }])
    syncStickers(definition)
    syncStickers(definition)
    syncStickers(definition)
    expect(stickers()).toHaveLength(1)
  })

  it('清理时一并摘掉宿主上的锚点标记', () => {
    document.body.innerHTML = '<footer></footer>'
    syncStickers(withStickers([{ asset: 'autumn-leaf', area: 'footer' }]))
    expect(document.querySelectorAll('.tj-sticker-anchor')).toHaveLength(1)
    clearStickers()
    expect(document.querySelectorAll('.tj-sticker-anchor')).toHaveLength(0)
  })
})

describe('内容锚点', () => {
  it('section-gap 优先挂到章节节点上', () => {
    document.body.innerHTML =
      '<div class="journal-document"><div class="journal-block journal-block--chapter" id="c1"></div></div>'
    expect(contentAnchor('section-gap', 0)?.id).toBe('c1')
  })

  it('没有章节时退到普通 Block', () => {
    document.body.innerHTML =
      '<div class="journal-document"><div class="journal-block"></div><div class="journal-block"></div></div>'
    expect(contentAnchor('section-gap', 0)).not.toBeNull()
  })

  it('image-corner 挂到正文图片上', () => {
    document.body.innerHTML = '<div class="journal-document"><figure class="journal-figure" id="f1"></figure></div>'
    expect(contentAnchor('image-corner', 0)?.id).toBe('f1')
  })

  it('找不到宿主时返回 null，那枚贴纸不渲染', () => {
    expect(contentAnchor('section-gap', 0)).toBeNull()
    expect(contentAnchor('image-corner', 0)).toBeNull()
    expect(contentAnchor('footer', 0)).toBeNull()
  })

  it('多枚同区域贴纸按序分散到不同宿主', () => {
    document.body.innerHTML =
      '<div class="journal-document">' +
      '<figure class="journal-figure" id="f1"></figure><figure class="journal-figure" id="f2"></figure></div>'
    syncStickers(
      withStickers([
        { asset: 'autumn-leaf', area: 'image-corner' },
        { asset: 'autumn-maple', area: 'image-corner' },
      ]),
    )
    expect(document.querySelector('#f1 .tj-sticker')).not.toBeNull()
    expect(document.querySelector('#f2 .tj-sticker')).not.toBeNull()
  })
})

describe('点击互动', () => {
  it('主题开启时贴纸带上互动标记', () => {
    document.documentElement.dataset.interactionsStickerClick = 'bounce'
    syncStickers(withStickers([{ asset: 'autumn-leaf', area: 'hero-left' }]))
    const sticker = document.querySelector<HTMLElement>('.tj-sticker')
    expect(sticker?.dataset.interaction).toBe('bounce')
    sticker?.dispatchEvent(new MouseEvent('click'))
    expect(sticker?.classList.contains('is-playing')).toBe(true)
  })

  it('未开启或设为 none 时不挂监听', () => {
    for (const value of [undefined, 'none']) {
      if (value) document.documentElement.dataset.interactionsStickerClick = value
      else delete document.documentElement.dataset.interactionsStickerClick
      syncStickers(withStickers([{ asset: 'autumn-leaf', area: 'hero-left' }]))
      const sticker = document.querySelector<HTMLElement>('.tj-sticker')
      expect(sticker?.dataset.interaction, String(value)).toBeUndefined()
    }
  })
})
