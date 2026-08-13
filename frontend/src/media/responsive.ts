/**
 * 给站内图片补上 srcset，让浏览器按视口和屏幕密度自己挑尺寸。
 *
 * 刻意在渲染时加而不是写进正文：一来存量日记能立刻受益，二来正文保持
 * `<img src>` 这种最朴素的形式，导出的 Markdown 换到别的博客也能用，后端那条
 * 「图片必须是站内地址」的校验也不用跟着放宽。
 *
 * sizes 用 68vw 作为保守估计：正文里的图默认占内容宽度的 68%，猜小了会糊，
 * 猜大了只是多下一点，所以宁可往大了写。
 */

/** 只认站内媒体地址的三档形态，其余一概不动。 */
const MEDIA_URL = /^(.*\/api\/media\/\d+)\/(display|medium|thumbnail)$/

const SIZES = '(max-width: 700px) 92vw, (max-width: 1100px) 78vw, 68vw'

export function applyResponsiveImages(root: ParentNode | null | undefined): void {
  if (!root) return
  root.querySelectorAll<HTMLImageElement>('img[src*="/api/media/"]').forEach(image => {
    // 处理过就跳过，正文重渲染时会重复扫到同一张
    if (image.dataset.responsive === 'on') return
    const match = image.getAttribute('src')?.match(MEDIA_URL)
    if (!match) return
    const base = match[1]
    image.srcset = base + '/thumbnail 480w, ' + base + '/medium 768w, ' + base + '/display 1280w'
    image.sizes = SIZES
    image.dataset.responsive = 'on'
  })
}
