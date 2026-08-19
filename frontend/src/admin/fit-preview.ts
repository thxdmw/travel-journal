/*
 * 把预览内容等比缩到容器里。
 *
 * 图片区块的高度随版式变化很大：同一张竖图，选「小图」和选「通栏出血」差好几倍。而预览区
 * 是固定高度的，于是大图必然溢出——要滚动才能看完的预览，等于没有预览。
 *
 * 限制图片最大高度是更省事的做法，但那会让「大图」和「中等」看起来一模一样，预览也就没有
 * 意义了。等比缩放保留全部比例关系，只是整体小一号——这正是缩略预览该有的样子。
 */

/**
 * 缩放下限。
 *
 * 极端长图（几十张的图片组、通栏全景）算出来的比例可以小到看不清，那时缩下去也没用，
 * 不如缩到这个程度就停手，剩下的交给滚动。
 */
export const FIT_MIN_SCALE = 0.35

/**
 * 把 {@link natural} 高度塞进 {@link available} 需要的缩放比。
 *
 * @returns 1 表示放得下，不需要缩
 */
export function fitScale(natural: number, available: number, min = FIT_MIN_SCALE): number {
  // 量不到尺寸时按「放得下」处理。NaN 一旦流进去，后面 `scale < 1` 是 false，
  // 缩放会静默失效——什么都不做比缩成一个点安全，但必须是有意为之而不是漏判。
  if (!Number.isFinite(natural) || !Number.isFinite(available)) return 1
  if (natural <= 0 || available <= 0 || natural <= available) return 1
  return Math.max(min, available / natural)
}

/** 容器的内容高度：clientHeight 含 padding，缩放时要把它扣掉。 */
function usableHeight(container: HTMLElement): number {
  const style = getComputedStyle(container)
  return container.clientHeight - edge(style.paddingTop) - edge(style.paddingBottom)
}

/** 读不到就当 0。空串在这里很常见（jsdom、部分嵌入式 WebView），而 parseFloat('') 是 NaN。 */
function edge(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export interface FitOptions {
  /**
   * 容器高度上限。
   *
   * 给了它，容器高度会跟着缩放后的内容走（区块列表那种由内容撑开的场景）；
   * 不给就用容器自己的高度，只缩内容不动容器（弹窗预览区那种固定高度的场景）。
   */
  max?: number
}

/**
 * 让容器里的内容保持等比缩放到容器内，并跟随内容变化。
 *
 * <p>缩放用 transform，它不参与布局，所以容器高度需要单独交代：固定高度的容器什么都不用做，
 * 由内容撑开的容器则要把高度改成缩放之后的实际高度，否则下面会空出一大块。</p>
 *
 * @param container 外层容器，它的第一个元素子节点会被缩放
 * @returns 取消观察的函数
 */
export function keepFitted(container: HTMLElement, options: FitOptions = {}): () => void {
  const inner = container.firstElementChild
  if (!(inner instanceof HTMLElement)) return () => undefined

  const apply = () => {
    // scrollHeight 是布局尺寸，不受 transform 影响，所以这里量到的一直是「没缩之前有多高」
    const natural = inner.scrollHeight
    const available = options.max ?? usableHeight(container)
    const scale = fitScale(natural, available)
    inner.style.transformOrigin = 'top center'
    inner.style.transform = scale < 1 ? `scale(${scale})` : ''
    /*
     * transform 不参与布局，缩小之后那块空间还占着。
     *
     * 固定高度的容器因此仍然按「没缩之前」的高度提供滚动：图片明明已经整张看得见了，
     * 却还能往下滚出一片空白——预览区看着就像没放下。用负 margin 把多出来的那段收掉，
     * 布局高度就等于眼睛看到的高度。
     */
    inner.style.marginBottom = scale < 1 ? `${-Math.round(natural * (1 - scale))}px` : ''
    if (options.max != null) container.style.height = `${Math.round(natural * scale)}px`
  }

  apply()
  /*
   * 观察内容而不是容器：图片是异步解码的，加载完成那一刻内容高度才定下来。
   * ResizeObserver 能感知到这次变化，不需要额外去监听每张图的 load。
   *
   * 拿不到这个 API 时退回「只算这一次」：预览不跟随后续变化，但不会因此整个崩掉。
   */
  if (typeof ResizeObserver === 'undefined') return () => undefined
  const observer = new ResizeObserver(apply)
  observer.observe(inner)
  return () => observer.disconnect()
}
