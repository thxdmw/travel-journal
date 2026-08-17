/**
 * 给站内图片补上 srcset 的兜底路径。
 *
 * 正常情况下 journal/render.ts 输出 `<img>` 时就带好了 srcset 和 data-responsive——
 * 事后再补会让浏览器加载两次：先按 src 下 1280 那张，srcset 到位后又按 sizes 重新
 * 评估换一档，图片空一下再出现。所以主路径已经不依赖这里了。
 *
 * 保留它是为了那些不经渲染器的容器（历史内容、直接塞进页面的片段）。已经带
 * data-responsive 的会被跳过，不会重复处理。
 *
 * 候选集直接复用渲染器那一份，不再各写一遍：两边只要有一处不同步，同一张图在两条
 * 路径下就会被挑成不同尺寸。
 */

import { mediaSrcset } from '@/journal/render'

/**
 * 只认站内媒体地址的三档形态，其余一概不动。
 *
 * 查询串单独捕获后原样带进每一档：草稿预览的图片地址带着 previewToken，
 * 丢掉它就是 403。
 */
const MEDIA_URL = /^(.*\/api\/media\/\d+)\/(?:display|medium|thumbnail)(\?.*)?$/

const SIZES = '(max-width: 700px) 92vw, (max-width: 1100px) 78vw, 68vw'

export function applyResponsiveImages(root: ParentNode | null | undefined): void {
  if (!root) return
  root.querySelectorAll<HTMLImageElement>('img[src*="/api/media/"]').forEach(image => {
    // 处理过就跳过，正文重渲染时会重复扫到同一张
    if (image.dataset.responsive === 'on') return
    const match = image.getAttribute('src')?.match(MEDIA_URL)
    const base = match?.[1]
    if (!base) return
    image.srcset = mediaSrcset(base, match?.[2] ?? '')
    image.sizes = SIZES
    image.dataset.responsive = 'on'
  })
}
