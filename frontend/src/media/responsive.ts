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
 * 属性值必须和渲染器里那份保持一致，否则同一张图在两条路径下会挑出不同尺寸。
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
