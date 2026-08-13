/** 滚动揭示。元素进入视口时加类，由 CSS 做淡入。 */

/** 参与揭示的元素。选择器有意保守，只覆盖大块内容，不逐条动列表项。 */
const REVEAL_TARGETS = '.card-grid > *, .section, .journal-figure, .journal-gallery'

let observer: IntersectionObserver | null = null

/** 把已加的类清干净。关掉时必须调，否则元素会停在透明状态再也不出现。 */
function clearRevealClasses(): void {
  document.querySelectorAll('.tj-reveal').forEach(element => {
    element.classList.remove('tj-reveal', 'tj-revealed')
  })
}

export function teardownScrollReveal(): void {
  if (observer) {
    observer.disconnect()
    observer = null
  }
  clearRevealClasses()
}

/**
 * 按当前开关重建揭示观察器。
 *
 * `enabled` 由调用方结合主题设置和系统的「减少动态效果」算好——这一层不读
 * matchMedia，好让它在测试和 SSR 里都能跑。
 */
export function syncScrollReveal(enabled: boolean): void {
  teardownScrollReveal()
  if (!enabled) return
  // 环境不支持就安静跳过，不要让整个特效运行时挂掉
  if (typeof IntersectionObserver === 'undefined') return

  const targets = document.querySelectorAll(REVEAL_TARGETS)
  if (!targets.length) return

  observer = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('tj-revealed')
        observer?.unobserve(entry.target) // 只揭示一次，不做来回切换
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  )
  targets.forEach(element => {
    element.classList.add('tj-reveal')
    observer?.observe(element)
  })
}

/** 仅供测试查看当前是否挂着观察器。 */
export function hasScrollRevealObserver(): boolean {
  return observer !== null
}
