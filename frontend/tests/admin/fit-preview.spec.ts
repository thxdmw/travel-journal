import { describe, expect, it } from 'vitest'
import { FIT_MIN_SCALE, fitScale, keepFitted } from '@/admin/fit-preview'

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
 * 缩放之后布局高度也要跟着收。
 *
 * transform 不参与布局：视觉上缩小了，那块空间还占着。固定高度的容器于是仍按「没缩之前」
 * 提供滚动——图片明明整张都看得见了，却还能往下滚出一片空白，预览区看着就像没放下。
 */
describe('缩放后的布局高度', () => {
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

  it('缩小时用负 margin 把多出来的高度收掉', () => {
    const { container, inner } = preview(400, 200)

    keepFitted(container)

    // scale 0.5 之后视觉高度是 200，布局上要收掉另外那 200
    expect(inner.style.transform).toBe('scale(0.5)')
    expect(inner.style.marginBottom).toBe('-200px')
  })

  it('放得下时不留任何补偿', () => {
    const { container, inner } = preview(150, 300)

    keepFitted(container)

    expect(inner.style.transform).toBe('')
    expect(inner.style.marginBottom).toBe('')
  })

  it('由内容撑开的容器同时收紧自身高度', () => {
    const { container, inner } = preview(600, 0)

    keepFitted(container, { max: 300 })

    expect(inner.style.transform).toBe('scale(0.5)')
    expect(container.style.height).toBe('300px')
  })
})
