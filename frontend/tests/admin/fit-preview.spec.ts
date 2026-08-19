import { describe, expect, it } from 'vitest'
import { FIT_MIN_SCALE, FIT_SCALE_PROPERTY, fitScale, keepFitted } from '@/admin/fit-preview'

/*
 * 预览缩放比。
 *
 * 图片区块的高度随版式差好几倍，而预览区是固定高度的，大图必然溢出——要滚动才能看完的
 * 预览等于没有预览。这里锁住的是「缩多少」这个决定本身：放得下就别动，放不下就等比缩，
 * 但不能缩到看不清。
 */

describe('预览缩放比', () => {
  it('放得下就不缩', () => {
    expect(fitScale(100, 200)).toBe(1)
    // 正好装满也算放得下，不该为了一个像素去缩
    expect(fitScale(200, 200)).toBe(1)
  })

  it('放不下就按比例缩到容器内', () => {
    // 288 高的竖图塞进 190 的预览区，正是手机上「大图」的实际情形
    expect(fitScale(288, 190)).toBeCloseTo(190 / 288, 5)
    expect(fitScale(400, 200)).toBe(0.5)
  })

  it('再长也不会缩到看不清', () => {
    // 几十张的图片组、通栏全景：缩到这个程度就停手，剩下的交给滚动
    expect(fitScale(10_000, 100)).toBe(FIT_MIN_SCALE)
  })

  it('量不到尺寸时保持原样，不要缩成一个点', () => {
    // 元素还没进文档、或者容器高度是 0 的那一帧
    expect(fitScale(0, 200)).toBe(1)
    expect(fitScale(200, 0)).toBe(1)
    expect(fitScale(0, 0)).toBe(1)
  })

  it('缩放比可以按调用方的需要放宽下限', () => {
    expect(fitScale(1000, 100, 0.05)).toBeCloseTo(0.1, 5)
  })
})

/*
 * 缩放比怎么落到元素上。
 *
 * 写进 --fit-scale，由 CSS 接到正文栏宽度上，不再用 transform：transform 会把这块交给合成器
 * 单独栅格化，比例一改整层缓存作废，手机 GPU 重画要一到几帧、期间那层是空的——就是真机上
 * 「唰」地白一下。改栏宽只是普通布局，没有这个过程，也不再需要负 margin 去补偿「视觉缩了、
 * 空间还占着」。
 */
describe('缩放比的落点', () => {
  /** 造一个内容比容器高的预览区。jsdom 不做布局，所以两个高度都要自己交代。 */
  function preview(naturalHeight: number, containerHeight: number) {
    const container = document.createElement('div')
    const inner = document.createElement('div')
    container.appendChild(inner)
    document.body.appendChild(container)
    Object.defineProperty(container, 'clientHeight', { value: containerHeight, configurable: true })
    Object.defineProperty(inner, 'scrollHeight', { value: naturalHeight, configurable: true })
    return { container, inner }
  }

  function scaleOf(inner: HTMLElement) {
    return inner.style.getPropertyValue(FIT_SCALE_PROPERTY)
  }

  it('放不下就把比例写到元素上', () => {
    const { container, inner } = preview(400, 200)

    keepFitted(container)

    expect(scaleOf(inner)).toBe('0.5')
    // CSS 靠这个属性把缩放比接到栏宽上
    expect(inner.hasAttribute('data-fitted')).toBe(true)
  })

  it('缩放不再借助 transform 和负 margin', () => {
    const { container, inner } = preview(400, 200)

    keepFitted(container)

    expect(inner.style.transform).toBe('')
    expect(inner.style.marginBottom).toBe('')
  })

  it('放得下就是原样', () => {
    const { container, inner } = preview(150, 300)

    keepFitted(container)

    expect(scaleOf(inner)).toBe('1')
  })

  it('由内容撑开的容器同时收紧自身高度', () => {
    const { container, inner } = preview(600, 0)

    keepFitted(container, { max: 300 })

    expect(scaleOf(inner)).toBe('0.5')
    expect(container.style.height).toBe('300px')
  })

  /*
   * 量到一样就不要再写。
   *
   * 图片解码、容器改高会让观察者连着回调好几次，其中多数算出来的比例和上次相同。照写不误
   * 只是白白多几轮样式重算，而每一轮都是一次闪的机会。
   */
  it('比例没变就不重复写样式', () => {
    const { container, inner } = preview(400, 200)
    const handle = keepFitted(container)
    inner.style.setProperty(FIT_SCALE_PROPERTY, '(改过了)')

    handle.refresh()

    expect(scaleOf(inner)).toBe('(改过了)')
  })

  it('内容高度变了立刻跟上', () => {
    const { container, inner } = preview(400, 200)
    const handle = keepFitted(container)
    expect(scaleOf(inner)).toBe('0.5')

    // 换了版式，同一块预览变矮了一半
    Object.defineProperty(inner, 'scrollHeight', { value: 200, configurable: true })
    handle.refresh()

    expect(scaleOf(inner)).toBe('1')
  })

  /*
   * zoom 参与布局，带着它量到的是缩过之后的高度。拿这个再算一次缩放就会越缩越小——
   * 一块 400 高、缩到 0.5 的预览，再量一次得到 200，正好「放得下」，于是弹回 1；下一轮
   * 又变 0.5。真机上这就是没完没了的抖动。
   */
  it('重复测量不会越缩越小', () => {
    const { container, inner } = preview(400, 200)
    /*
     * jsdom 不做布局，栏宽对高度的影响得自己造出来：真实浏览器里栏窄一圈，图片跟着小一圈，
     * 量到的就是缩过的高度——这正是测量必须先把缩放归位的原因。
     */
    Object.defineProperty(inner, 'scrollHeight', {
      get: () => {
        const scale = Number(inner.style.getPropertyValue(FIT_SCALE_PROPERTY) || 1)
        return Math.round(400 * (Number.isFinite(scale) && scale > 0 ? scale : 1))
      },
      configurable: true,
    })
    const handle = keepFitted(container)

    handle.refresh()
    handle.refresh()

    // 归位再量，每次都该量到 400、算出 0.5。少了归位这一步就会 0.5 → 1 → 0.5 地抖
    expect(scaleOf(inner)).toBe('0.5')
  })
})
