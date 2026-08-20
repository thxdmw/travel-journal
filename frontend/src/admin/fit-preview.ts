/*
 * 把预览内容等比缩到容器里。
 *
 * 图片区块的高度随版式变化很大：同一张竖图，选「小图」和选「正文宽度」差好几倍。而预览区
 * 是固定高度的，于是大图必然溢出——要滚动才能看完的预览，等于没有预览。
 *
 * 限制图片最大高度是更省事的做法，但那会让「大图」和「中等」看起来一模一样，预览也就没有
 * 意义了。等比缩放保留全部比例关系，只是整体小一号——这正是缩略预览该有的样子。
 *
 *
 * 缩放靠改正文栏宽度，不用 transform。
 *
 * transform 把元素交给合成器单独栅格化。比例一改，那一层的栅格化缓存整个作废，GPU 要按
 * 新尺寸重画一遍——桌面上快到看不见，手机 GPU 上要一到几帧，这期间那层是空的，看起来就是
 * 预览「唰」地白一下再回来。连纯 CSS 画的假文字线都跟着白，因为整层都没了，与图片无关。
 * 这也是为什么桌面开仿真设备怎么试都不复现：仿真换的是视口尺寸，渲染仍走桌面 GPU。
 *
 * 而「等比缩小」这件事本来就等于「正文栏窄一圈」：图片是 max-width:100% + height:auto，
 * 栏宽小一圈图片就小一圈，高度按固有比例自己跟上。全程只是普通布局，没有图层作废重建这
 * 回事；也省掉了 transform 那套补偿——transform 不改变布局尺寸，缩完还得拿负 marginBottom
 * 把空出来的地方收回去，改宽度则布局高度本来就等于眼睛看到的高度。
 *
 * 中途试过 zoom，不行：Blink 的 zoom 只缩绝对长度，不缩百分比。正文栏是 width:72%，宽度
 * 纹丝不动，里面的图片自然也不会变小。
 *
 * 代价是量尺寸要当心：栏宽一变高度就跟着变，带着缩放量到的是缩过之后的高度，拿它再算一次
 * 就会越缩越小，所以每次测量前先把缩放归位（见 measure）。
 */

/**
 * 缩放比写在这个自定义属性上，怎么用由 CSS 决定。
 *
 * 除了栏宽，那些不随宽度走的固定尺寸——假文字线的高度、段落间距——也得乘上它，否则缩得越
 * 狠它们占的比例越大，算出来的高度就对不上，缩完仍旧塞不下。
 */
export const FIT_SCALE_PROPERTY = '--fit-scale'

/** 标记「这个元素归 keepFitted 管」，CSS 靠它把缩放比接到栏宽上。 */
export const FIT_ATTRIBUTE = 'data-fitted'

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

/** {@link keepFitted} 的句柄。 */
export interface FitHandle {
  /**
   * 立刻重量一次。
   *
   * 内容刚换过、还等不到观察者回调的那一帧用它——ResizeObserver 要等布局结束才通知，
   * 那之前新内容会以未缩放的原始大小画出来一帧。
   */
  refresh(): void
  /** 取消观察。 */
  release(): void
}

/**
 * 让容器里的内容保持等比缩放到容器内，并跟随内容变化。
 *
 * <p>缩放走 zoom，它参与布局，所以缩完布局高度自己就是对的。只有由内容撑开的容器需要额外
 * 把自身高度定下来，免得下面空出一块。</p>
 *
 * @param container 外层容器，它的第一个元素子节点会被缩放
 */
export function keepFitted(container: HTMLElement, options: FitOptions = {}): FitHandle {
  const inner = container.firstElementChild
  if (!(inner instanceof HTMLElement)) return { refresh: () => undefined, release: () => undefined }
  inner.setAttribute(FIT_ATTRIBUTE, '')

  /*
   * 上一次写进去的那组值。
   *
   * 观察者在图片解码、容器改高时会连着回调好几次，而其中大多数算出来的缩放和上次一模一样。
   * 照写不误的话每次都是一轮样式重算，还会让 ResizeObserver 因为「回调里改了尺寸」再排一轮
   * 通知。量到什么写什么、量到一样就住手，闪的机会少一次是一次。
   */
  let applied = ''

  /**
   * 正文栏满宽时内容有多高。
   *
   * 栏宽一缩高度就跟着缩，所以量之前得先把缩放归位，否则量到的是缩过之后的高度——拿这个
   * 再算一次，一次比一次小，最后缩成一小条。归位和写回在同一个任务里完成，中间只有布局
   * 没有绘制，屏幕上看不到。
   */
  const measure = (): number => {
    const current = inner.style.getPropertyValue(FIT_SCALE_PROPERTY)
    if (!current || current === '1') return inner.scrollHeight
    inner.style.setProperty(FIT_SCALE_PROPERTY, '1')
    const natural = inner.scrollHeight
    inner.style.setProperty(FIT_SCALE_PROPERTY, current)
    return natural
  }

  const apply = () => {
    const natural = measure()
    const available = options.max ?? usableHeight(container)
    const scale = fitScale(natural, available)
    const signature = `${scale}:${natural}`
    if (signature === applied) return
    applied = signature
    inner.style.setProperty(FIT_SCALE_PROPERTY, String(scale))
    if (options.max != null) container.style.height = `${Math.round(natural * scale)}px`
  }

  apply()
  /*
   * 观察内容而不是容器：图片是异步解码的，加载完成那一刻内容高度才定下来。
   * ResizeObserver 能感知到这次变化，不需要额外去监听每张图的 load。
   *
   * 拿不到这个 API 时退回「只算这一次」：预览不跟随后续变化，但不会因此整个崩掉。
   */
  if (typeof ResizeObserver === 'undefined') return { refresh: apply, release: () => undefined }
  const observer = new ResizeObserver(apply)
  observer.observe(inner)
  /*
   * 容器也要观察，否则「容器变高了」这件事只能等下一次内容变化顺带纠正。
   *
   * 弹窗有入场动画，第一次 apply 赶上的是过渡当中的高度，算出来的比例偏小；等图片解码完
   * 触发观察者时容器已经稳定，比例又跳回去——打开配置弹窗时那一下闪就是这么来的。切 Tab、
   * 旋屏、软键盘收放同理。
   *
   * 由内容撑开的容器（给了 max）不能这么观察：那种容器的高度正是 apply 自己写的，观察它
   * 等于自己盯着自己。
   */
  if (options.max == null) observer.observe(container)
  return { refresh: apply, release: () => observer.disconnect() }
}
