import { beforeEach, describe, expect, it } from 'vitest'
import { enhance, teardown } from '@/media/enhance'
import { applyResponsiveImages } from '@/media/responsive'

beforeEach(() => {
  document.body.innerHTML = ''
  delete document.documentElement.dataset.galleryLayout
})

function gallery(extraClass: string, count: number, caption = false): HTMLElement {
  const images = Array.from({ length: count }, (_v, i) => `<img src="/api/media/${i + 1}/display">`).join('')
  document.body.innerHTML = `
    <div class="journal-document">
      <figure class="journal-gallery ${extraClass}">${images}${caption ? '<figcaption>图注</figcaption>' : ''}</figure>
    </div>`
  return document.querySelector('.journal-gallery')!
}

describe('响应式图片', () => {
  it('给三档站内地址补上 srcset 与 sizes', () => {
    document.body.innerHTML = '<img src="/api/media/42/display">'
    applyResponsiveImages(document.body)
    const image = document.querySelector('img')!
    expect(image.srcset).toBe('/api/media/42/thumbnail 480w, /api/media/42/medium 768w, /api/media/42/display 1280w')
    expect(image.sizes).toContain('68vw')
    expect(image.dataset.responsive).toBe('on')
  })

  it('medium 与 thumbnail 也认', () => {
    document.body.innerHTML = '<img src="/api/media/42/medium"><img src="/api/media/7/thumbnail">'
    applyResponsiveImages(document.body)
    expect(document.querySelectorAll('img[data-responsive="on"]')).toHaveLength(2)
  })

  it('绝对地址同样处理', () => {
    document.body.innerHTML = '<img src="https://site.test/api/media/42/display">'
    applyResponsiveImages(document.body)
    expect(document.querySelector('img')!.srcset).toContain('https://site.test/api/media/42/thumbnail')
  })

  it('不是三档形态的站内地址不动', () => {
    // original 是原图，正文里不该出现，出现了也不要替它生成 srcset
    document.body.innerHTML = '<img src="/api/media/42/original"><img src="/api/media/42">'
    applyResponsiveImages(document.body)
    expect(document.querySelectorAll('img[data-responsive]')).toHaveLength(0)
  })

  it('站外图片一概不动', () => {
    document.body.innerHTML = '<img src="https://evil.test/x.png">'
    applyResponsiveImages(document.body)
    expect(document.querySelector('img')!.srcset).toBe('')
  })

  it('重复调用是幂等的', () => {
    document.body.innerHTML = '<img src="/api/media/42/display">'
    applyResponsiveImages(document.body)
    const first = document.querySelector('img')!.srcset
    applyResponsiveImages(document.body)
    expect(document.querySelector('img')!.srcset).toBe(first)
  })

  it('没有 root 时安静返回', () => {
    expect(() => applyResponsiveImages(null)).not.toThrow()
  })
})

describe('轮播', () => {
  it('两张以上生成轨道、箭头和圆点', () => {
    const block = gallery('journal-gallery--carousel', 3)
    enhance(document.body)

    expect(block.querySelector('.journal-carousel')).not.toBeNull()
    expect(block.querySelectorAll('.journal-carousel__track img')).toHaveLength(3)
    expect(block.querySelectorAll('.journal-carousel__nav')).toHaveLength(2)
    expect(block.querySelectorAll('.journal-carousel__dots button')).toHaveLength(3)
  })

  it('只有一张时保持原样，不做无意义的轮播', () => {
    const block = gallery('journal-gallery--carousel', 1)
    enhance(document.body)
    expect(block.querySelector('.journal-carousel')).toBeNull()
  })

  it('图注被搬进轮播壳里', () => {
    const block = gallery('journal-gallery--carousel', 2, true)
    enhance(document.body)
    expect(block.querySelector('.journal-carousel > figcaption')).not.toBeNull()
  })

  it('胶片条不出箭头和圆点，靠拖动和滚轮浏览', () => {
    const block = gallery('journal-gallery--filmstrip', 3)
    enhance(document.body)
    expect(block.querySelector('.journal-carousel--strip')).not.toBeNull()
    expect(block.querySelectorAll('.journal-carousel__nav')).toHaveLength(0)
    expect(block.querySelectorAll('.journal-carousel__dots')).toHaveLength(0)
  })
})

describe('对比', () => {
  it('恰好两张时生成对比结构', () => {
    const block = gallery('journal-gallery--compare', 2)
    enhance(document.body)
    const shell = block.querySelector<HTMLElement>('.journal-compare')
    expect(shell).not.toBeNull()
    expect(shell?.style.getPropertyValue('--compare')).toBe('50%')
    expect(block.querySelector('.journal-compare__after img')).not.toBeNull()
    expect(block.querySelector('.journal-compare__handle')).not.toBeNull()
  })

  it('不是两张时退回原样，不猜用户的意思', () => {
    for (const count of [1, 3]) {
      const block = gallery('journal-gallery--compare', count)
      enhance(document.body)
      expect(block.querySelector('.journal-compare'), String(count)).toBeNull()
    }
  })

  it('图注留在对比壳外面，不被裁切遮罩盖住', () => {
    const block = gallery('journal-gallery--compare', 2, true)
    enhance(document.body)
    expect(block.querySelector(':scope > figcaption')).not.toBeNull()
  })

  it('滑块是可访问的 slider', () => {
    const block = gallery('journal-gallery--compare', 2)
    enhance(document.body)
    const handle = block.querySelector('.journal-compare__handle')!
    expect(handle.getAttribute('role')).toBe('slider')
    expect(handle.getAttribute('aria-valuenow')).toBe('50')
  })

  it('方向键调整分界位置', () => {
    const block = gallery('journal-gallery--compare', 2)
    enhance(document.body)
    const handle = block.querySelector('.journal-compare__handle')!
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(handle.getAttribute('aria-valuenow')).toBe('54')
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(handle.getAttribute('aria-valuenow')).toBe('50')
  })

  it('分界位置夹在 0..100', () => {
    const block = gallery('journal-gallery--compare', 2)
    enhance(document.body)
    const handle = block.querySelector('.journal-compare__handle')!
    for (let i = 0; i < 40; i++) {
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    }
    expect(handle.getAttribute('aria-valuenow')).toBe('100')
  })
})

describe('主题默认版式', () => {
  it('区块没写死版式时跟随主题', () => {
    gallery('', 3)
    document.documentElement.dataset.galleryLayout = 'carousel'
    enhance(document.body)
    expect(document.querySelector('.journal-carousel')).not.toBeNull()
  })

  it('区块写死了版式时不被主题改掉', () => {
    /*
     * 作者在某一篇里明确选过对比，换主题不该把它变成轮播。
     */
    const block = gallery('journal-gallery--compare', 2)
    document.documentElement.dataset.galleryLayout = 'carousel'
    enhance(document.body)
    expect(block.querySelector('.journal-compare')).not.toBeNull()
    expect(block.querySelector('.journal-carousel')).toBeNull()
  })

  it('主题没设版式时保持静态网格', () => {
    const block = gallery('', 3)
    enhance(document.body)
    expect(block.querySelector('.journal-carousel')).toBeNull()
  })
})

describe('重复增强与还原', () => {
  it('连续 enhance 不会越套越深', () => {
    const block = gallery('journal-gallery--carousel', 3)
    enhance(document.body)
    enhance(document.body)
    enhance(document.body)
    expect(block.querySelectorAll('.journal-carousel')).toHaveLength(1)
    expect(block.querySelectorAll('.journal-carousel__track img')).toHaveLength(3)
  })

  it('teardown 还原成原始结构', () => {
    /*
     * 比的是结构而不是 innerHTML 字符串：还原放回的是原来那一批节点，而
     * applyResponsiveImages 已经在这些节点上加过 srcset。属性留着是对的，
     * 下次 enhance 也不用重算。
     */
    const block = gallery('journal-gallery--carousel', 3)
    enhance(document.body)
    expect(block.querySelector('.journal-carousel')).not.toBeNull()

    teardown(document.body)
    expect(block.querySelector('.journal-carousel')).toBeNull()
    expect(Array.from(block.children).map(child => child.tagName)).toEqual(['IMG', 'IMG', 'IMG'])
  })

  it('还原后可以重新增强', () => {
    const block = gallery('journal-gallery--carousel', 3)
    enhance(document.body)
    teardown(document.body)
    enhance(document.body)
    expect(block.querySelectorAll('.journal-carousel')).toHaveLength(1)
  })

  it('对比结构同样能还原', () => {
    const block = gallery('journal-gallery--compare', 2, true)
    enhance(document.body)
    teardown(document.body)
    expect(block.querySelector('.journal-compare')).toBeNull()
    // 两张图和图注都回到原来的位置，不多不少
    expect(Array.from(block.children).map(child => child.tagName)).toEqual(['IMG', 'IMG', 'FIGCAPTION'])
  })

  it('没有 root 时安静返回', () => {
    expect(() => enhance(null)).not.toThrow()
    expect(() => teardown(undefined)).not.toThrow()
  })
})
