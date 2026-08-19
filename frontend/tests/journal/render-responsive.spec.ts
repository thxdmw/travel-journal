import { describe, expect, it } from 'vitest'
import { ARTICLE_PREVIEW_SIZES, PREVIEW_SIZES, render, renderBlock } from '@/journal/render'
import { createBlock, emptyDocument } from '@/journal/document'
import { applyResponsiveImages } from '@/media/responsive'
import type { JournalBlock } from '@/types/journal-block'

/*
 * 图片必须一插进 DOM 就带着 srcset。
 *
 * srcset 以前是渲染完再由 media/responsive.ts 补的，于是浏览器要加载两次：`<img src>`
 * 一出现就开始下 1280 那张，等 srcset 补上又按 sizes 重新评估、换一档重新下。图片先空
 * 一下再出现——这就是在手机上打开图片配置弹窗时看到的那一下闪烁。
 */

const media = [{
  id: 9,
  caption: '清晨的鸭川',
  width: 4000,
  height: 3000,
  thumbnailUrl: '/api/media/9/thumbnail',
  mediumUrl: '/api/media/9/medium',
  displayUrl: '/api/media/9/display',
}]

function imageBlock(overrides: Record<string, unknown> = {}): JournalBlock {
  const block = createBlock('image')
  Object.assign(block.data, { mediaId: 9, ...overrides })
  return block
}

function html(block: JournalBlock) {
  return renderBlock(block, media)
}

describe('正文图片的响应式属性', () => {
  it('单张图片渲染出来就带 srcset 和 sizes', () => {
    const output = html(imageBlock())

    expect(output).toContain('src="/api/media/9/display"')
    expect(output).toContain('/api/media/9/thumbnail 480w')
    expect(output).toContain('/api/media/9/medium 768w')
    expect(output).toContain('/api/media/9/display 1280w')
    expect(output).toContain('sizes=')
    expect(output).toContain('decoding="async"')
  })

  it('图片组里每一张都带 srcset', () => {
    const block = createBlock('gallery')
    Object.assign(block.data, { mediaIds: [9, 9] })

    const output = renderBlock(block, media)

    expect(output.match(/srcset=/g)).toHaveLength(2)
  })

  it('明信片同样带 srcset', () => {
    const block = createBlock('postcard')
    Object.assign(block.data, { mediaId: 9, location: '京都' })

    expect(renderBlock(block, media)).toContain('srcset=')
  })

  it('渲染出的图片不会被 applyResponsiveImages 二次处理', () => {
    const root = document.createElement('div')
    root.innerHTML = html(imageBlock())
    const image = root.querySelector('img')!
    const before = image.getAttribute('srcset')

    applyResponsiveImages(root)

    // data-responsive 已经是 on，兜底路径必须原样跳过——再设一次就等于让浏览器重新评估
    expect(image.getAttribute('data-responsive')).toBe('on')
    expect(image.getAttribute('srcset')).toBe(before)
  })

  it('本机预览的 blob 地址不加 srcset', () => {
    // 上传占位期间 src 是 objectURL，没有三档规格可选
    const output = html(imageBlock({ mediaId: null, previewUrl: 'blob:local-preview' }))

    expect(output).toContain('src="blob:local-preview"')
    expect(output).not.toContain('srcset=')
  })

  it('草稿预览的图片也有 srcset，并且每一档都带着令牌', () => {
    /*
     * 预览链接下的图片地址长这样：/api/media/9/display?previewToken=xxx。
     * 令牌是这些图片唯一的通行证，候选档位丢了它就是一整篇 403；而正则不接受
     * 查询串的话，草稿预览在手机上又会照样去下 1280 那张。两件事都得成立。
     */
    const previewMedia = [{
      id: 9,
      caption: '清晨的鸭川',
      thumbnailUrl: '/api/media/9/thumbnail?previewToken=abc',
      mediumUrl: '/api/media/9/medium?previewToken=abc',
      displayUrl: '/api/media/9/display?previewToken=abc',
    }]

    const output = renderBlock(imageBlock(), previewMedia)

    expect(output).toContain('/api/media/9/thumbnail?previewToken=abc 480w')
    expect(output).toContain('/api/media/9/medium?previewToken=abc 768w')
    expect(output).toContain('/api/media/9/display?previewToken=abc 1280w')
  })

  it('兜底路径同样保留预览令牌', () => {
    const root = document.createElement('div')
    root.innerHTML = '<img src="/api/media/9/display?previewToken=abc">'

    applyResponsiveImages(root)

    expect(root.querySelector('img')!.getAttribute('srcset'))
      .toContain('/api/media/9/medium?previewToken=abc 768w')
  })

  it('整篇文档渲染走的是同一条图片输出', () => {
    const doc = emptyDocument()
    doc.blocks.push(imageBlock())

    expect(render(doc, media)).toContain('srcset=')
  })

  /*
   * 编辑器里的小预览不该按正文宽度挑图。
   *
   * 区块列表的缩略图和配置弹窗里的「正文效果」都只有一两百像素宽，沿用正文那套 92vw
   * 的话，浏览器按手机屏幕算出上千设备像素、转头去下 1280 那一档——为了画这么小一块
   * 解码一整张大图，打开弹窗时就是可见的一下卡顿。
   */

  it('小预览用自己的尺寸提示，候选档位不变', () => {
    const output = renderBlock(imageBlock(), media, { sizes: PREVIEW_SIZES })

    expect(output).toContain(`sizes="${PREVIEW_SIZES}"`)
    expect(output).not.toContain('92vw')
    // 候选档位照旧三档，变的只是浏览器该挑哪一档
    expect(output).toContain('/api/media/9/thumbnail 480w')
    expect(output).toContain('/api/media/9/display 1280w')
  })

  it('不传选项时仍然是正文那套宽度', () => {
    expect(renderBlock(imageBlock(), media)).toContain('92vw')
  })

  it('图片组和明信片同样接受尺寸提示', () => {
    const gallery = createBlock('gallery')
    Object.assign(gallery.data, { mediaIds: [9, 9] })
    const postcard = createBlock('postcard')
    Object.assign(postcard.data, { mediaId: 9, location: '京都' })

    expect(renderBlock(gallery, media, { sizes: PREVIEW_SIZES }).match(/240px/g)).toHaveLength(2)
    expect(renderBlock(postcard, media, { sizes: PREVIEW_SIZES })).toContain('240px')
  })

  /*
   * 图片要带上原图尺寸。
   *
   * 少了 width/height，每张图都是「先占 0 高度、加载完再撑开」：正文滚动位置会跳，配置
   * 弹窗的等比缩放会先按没有图片的高度算一遍、图片就位后再跳到实际比例——那就是改版式和
   * 打开预览时看到的闪烁。
   */

  it('输出原图的宽高，浏览器加载前就能留好位置', () => {
    const output = html(imageBlock())

    expect(output).toContain('width="4000"')
    expect(output).toContain('height="3000"')
  })

  it('图片组每一张都带宽高', () => {
    const block = createBlock('gallery')
    Object.assign(block.data, { mediaIds: [9, 9] })

    expect(renderBlock(block, media).match(/width="4000"/g)).toHaveLength(2)
  })

  it('拿不到尺寸时不硬编一个假的', () => {
    // 存量数据、外链、本机 blob 预览都可能没有尺寸
    const unsized = [{ id: 9, displayUrl: '/api/media/9/display' }]

    const output = renderBlock(imageBlock(), unsized)

    expect(output).not.toContain('width=')
    expect(output).not.toContain('height=')
  })

  it('预览全文用比正文窄的尺寸提示', () => {
    const doc = emptyDocument()
    doc.blocks.push(imageBlock())

    const output = render(doc, media, { sizes: ARTICLE_PREVIEW_SIZES })

    expect(output).toContain('560px')
    expect(output).not.toContain('92vw')
  })
})

/*
 * 编辑器里的小预览要图文一起出现。
 *
 * async 的意思正是「先画周围，图晚一点补上」——每次内容重建都会露出一帧空框，看起来就是
 * 预览闪了一下。而 lazy 的那轮可见性判断对一张就在眼前、只有两百来像素的图毫无用处。
 * 正文反过来：一篇几十张图，绝不能为了图片推迟正文出现。
 */
describe('图片的加载时机', () => {
  it('编辑器预览抢在这一帧把图画出来', () => {
    const output = renderBlock(imageBlock(), media, { sizes: PREVIEW_SIZES, eager: true })

    expect(output).toContain('loading="eager"')
    expect(output).toContain('decoding="sync"')
  })

  it('正文照旧是滚到哪儿加载到哪儿', () => {
    const output = html(imageBlock())

    expect(output).toContain('loading="lazy"')
    expect(output).toContain('decoding="async"')
  })

  it('图片组和明信片跟着同一套规矩', () => {
    const group = createBlock('gallery')
    Object.assign(group.data, { mediaIds: [9, 9] })
    const card = createBlock('postcard')
    Object.assign(card.data, { mediaId: 9, location: '京都' })

    expect(renderBlock(group, media, { eager: true }).match(/decoding="sync"/g)).toHaveLength(2)
    expect(renderBlock(card, media, { eager: true })).toContain('decoding="sync"')
  })
})
