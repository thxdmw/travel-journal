import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PREVIEW_MAX_EDGE, createLocalPreview, releaseLocalPreview } from '@/media/local-preview'

/*
 * jsdom 没有真正的图片解码器，所以这里验证的是「调用了什么、缩到多大、并发几张」，
 * 而不是像素结果。真正的视觉稳定性由手机端 E2E 覆盖。
 */

const created: string[] = []
const revoked: string[] = []
let bitmapCalls: Array<Record<string, unknown> | undefined> = []
let inFlight = 0
let peakInFlight = 0

function stubCanvas() {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toBlob: (callback: (blob: Blob | null) => void) => callback(new Blob(['thumb'], { type: 'image/jpeg' })),
  }
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
    tag === 'canvas' ? canvas : document.createElementNS('http://www.w3.org/1999/xhtml', tag)) as never)
  return canvas
}

function bitmap(width: number, height: number) {
  return { width, height, close: vi.fn() }
}

beforeEach(() => {
  created.length = 0
  revoked.length = 0
  bitmapCalls = []
  inFlight = 0
  peakInFlight = 0
  let seq = 0
  window.URL.createObjectURL = vi.fn(() => { const url = `blob:${++seq}`; created.push(url); return url })
  window.URL.revokeObjectURL = vi.fn((url: string) => { revoked.push(url) })
})

afterEach(() => vi.restoreAllMocks())

describe('本机上传预览', () => {
  it('按最长边缩到 256，并且不把原图解码进画布', async () => {
    const canvas = stubCanvas()
    vi.stubGlobal('createImageBitmap', vi.fn(async (_blob: Blob, options?: Record<string, unknown>) => {
      bitmapCalls.push(options)
      return options?.resizeWidth ? bitmap(Number(options.resizeWidth), Number(options.resizeHeight)) : bitmap(4000, 3000)
    }))

    const url = await createLocalPreview(new Blob(['photo'], { type: 'image/jpeg' }))

    expect(url).toMatch(/^blob:/)
    // 4000×3000 → 256×192，长边正好是上限
    expect(bitmapCalls[1]).toMatchObject({ resizeWidth: PREVIEW_MAX_EDGE, resizeHeight: 192 })
    expect(canvas.width).toBe(PREVIEW_MAX_EDGE)
    // EXIF 里躺着的照片必须摆正，否则占位图和最终图片方向不一致
    expect(bitmapCalls[0]).toMatchObject({ imageOrientation: 'from-image' })
  })

  it('同时最多解码两张，避免一次选十张把内存冲上去', async () => {
    stubCanvas()
    vi.stubGlobal('createImageBitmap', vi.fn(async (_blob: Blob, options?: Record<string, unknown>) => {
      inFlight++
      peakInFlight = Math.max(peakInFlight, inFlight)
      await new Promise(resolve => setTimeout(resolve, 5))
      inFlight--
      return options?.resizeWidth ? bitmap(Number(options.resizeWidth), Number(options.resizeHeight)) : bitmap(4000, 3000)
    }))

    await Promise.all(Array.from({ length: 8 }, () => createLocalPreview(new Blob(['photo'], { type: 'image/jpeg' }))))

    expect(peakInFlight).toBeLessThanOrEqual(2)
  })

  it('缩略失败时退回原图，作者始终看得见自己刚选的照片', async () => {
    stubCanvas()
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('解码失败') }))
    // jsdom 不会真的加载图片，用一个只会报错的替身把流程逼到最后的兜底分支
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null
      onerror: ((event: unknown) => void) | null = null
      set src(_value: string) { setTimeout(() => this.onerror?.(new Event('error')), 0) }
    })

    const url = await createLocalPreview(new Blob(['photo'], { type: 'image/jpeg' }))

    expect(url).toMatch(/^blob:/)
  })

  it('释放预览对空值是安全的', () => {
    releaseLocalPreview('blob:1')
    releaseLocalPreview(null)
    releaseLocalPreview('')
    expect(revoked).toEqual(['blob:1'])
  })
})
