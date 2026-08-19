import { describe, expect, it } from 'vitest'
import { PREVIEW_SIZES, render, renderBlock } from '@/journal/render'
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
})
