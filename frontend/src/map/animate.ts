import type { LatLng } from '@/types/travel-map'

/**
 * 路线绘制动画的插值。
 *
 * 两个 Provider 都只需要一个「重新设置整条路径」的回调，不用碰 SVG 内部结构或
 * 各家的动画插件，实现成本最低，效果也是语义一致——真的在画，不要求两边像素级
 * 相同。
 */

/** 算出进度 t（0..1）时应该画到哪里。最后一段用线性插值补出半截。 */
export function pathAtProgress(fullPoints: readonly LatLng[], t: number): LatLng[] {
  const total = fullPoints.length
  if (total === 0) return []
  const clamped = Math.max(0, Math.min(1, t))
  const exact = clamped * (total - 1)
  const index = Math.floor(exact)
  const fraction = exact - index
  const path = fullPoints.slice(0, index + 1)
  if (index < total - 1 && fraction > 0) {
    const a = fullPoints[index]
    const b = fullPoints[index + 1]
    if (a && b) path.push([a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction])
  }
  return path
}

export function animateRoutePath(
  setPath: (points: LatLng[]) => void,
  fullPoints: readonly LatLng[],
  duration: number,
): void {
  const start = performance.now()
  function frame(now: number): void {
    const t = Math.min(1, (now - start) / duration)
    setPath(pathAtProgress(fullPoints, t))
    if (t < 1) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
