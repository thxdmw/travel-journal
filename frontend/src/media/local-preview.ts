/*
 * 上传占位用的本机小图预览。
 *
 * 手机拍的照片是 4000×3000 起步的。把它的 Object URL 直接塞进正文里那个 56×56 的
 * 占位缩略图，浏览器仍然要把整张图解码成上千万像素的位图——选三张就是三次大解码，
 * 主线程被占住，页面跟着白一下、抖一下。上传进度每秒改十几次，又会让这一块反复重绘。
 *
 * 所以先在本机把它缩到最长边 256px 再显示。上传的仍然是原始 File，服务端拿到的
 * 字节和作者选中的那一份完全一致——这里只影响屏幕上那几十像素。
 */

/** 预览图最长边。占位缩略图实际只有 56px，256 已经够 3 倍屏用。 */
export const PREVIEW_MAX_EDGE = 256

/**
 * 同时解码的张数上限。
 *
 * 一次选十张的话，并行解码十张原图的峰值内存足够让手机浏览器把这个标签页杀掉。
 * 两张既能盖住解码和编码的间隙，又不会让内存冒尖。
 */
const CONCURRENCY = 2

let active = 0
const waiting: Array<() => void> = []

async function acquire(): Promise<void> {
  if (active < CONCURRENCY) {
    active++
    return
  }
  await new Promise<void>(resolve => waiting.push(resolve))
  active++
}

function release(): void {
  active--
  const next = waiting.shift()
  if (next) next()
}

function scaled(width: number, height: number): { width: number, height: number } {
  const longest = Math.max(width, height)
  if (!longest || longest <= PREVIEW_MAX_EDGE) return { width: width || 1, height: height || 1 }
  const ratio = PREVIEW_MAX_EDGE / longest
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) }
}

function toBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('缩略图编码失败'))), 'image/jpeg', 0.8)
  })
}

/** 首选路径：createImageBitmap 直接按目标尺寸解码，不会在内存里展开整张原图。 */
async function viaImageBitmap(file: Blob): Promise<string> {
  if (typeof createImageBitmap !== 'function') throw new Error('不支持 createImageBitmap')
  // 先只读尺寸，再按目标大小重新解码；imageOrientation 让 EXIF 里躺着的照片立起来
  const probe = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const size = scaled(probe.width, probe.height)
  probe.close()
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
    resizeWidth: size.width,
    resizeHeight: size.height,
    resizeQuality: 'medium',
  })
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('无法创建画布上下文')
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return toBlobUrl(canvas)
}

/**
 * 回退路径：iOS 上的 Safari 长期不支持 createImageBitmap 的 resize 选项。
 *
 * `<img>` 解码时浏览器已经按 EXIF 方向摆正了，所以这里不需要自己转矩阵。
 */
function viaImageElement(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const source = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      try {
        const size = scaled(image.naturalWidth, image.naturalHeight)
        const canvas = document.createElement('canvas')
        canvas.width = size.width
        canvas.height = size.height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('无法创建画布上下文')
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        toBlobUrl(canvas).then(resolve, reject)
      } catch (error) {
        reject(error instanceof Error ? error : new Error('缩略图生成失败'))
      } finally {
        URL.revokeObjectURL(source)
      }
    }
    image.onerror = () => {
      URL.revokeObjectURL(source)
      reject(new Error('图片无法解码'))
    }
    image.src = source
  })
}

/**
 * 生成一张本机预览图，返回可直接放进 `src` 的 Object URL。
 *
 * 调用方负责在不用的时候交给 {@link releaseLocalPreview}。缩略失败时退回原图的
 * Object URL——宁可这一张解码贵一点，也不能让作者看不见自己刚选的照片。
 */
export async function createLocalPreview(file: Blob): Promise<string> {
  await acquire()
  try {
    return await viaImageBitmap(file)
  } catch {
    try {
      return await viaImageElement(file)
    } catch {
      return URL.createObjectURL(file)
    }
  } finally {
    release()
  }
}

/** 释放预览 URL。传空值是安全的，方便在各种清理路径上无脑调用。 */
export function releaseLocalPreview(url: string | null | undefined): void {
  if (url) URL.revokeObjectURL(url)
}
