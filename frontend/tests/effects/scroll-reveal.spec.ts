import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasScrollRevealObserver, syncScrollReveal, teardownScrollReveal } from '@/effects/scroll-reveal'

/** jsdom 没有 IntersectionObserver，用一个能手动触发的替身。 */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  observed = new Set<Element>()
  disconnected = false

  constructor(private callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this)
  }

  observe(element: Element): void {
    this.observed.add(element)
  }

  unobserve(element: Element): void {
    this.observed.delete(element)
  }

  disconnect(): void {
    this.disconnected = true
    this.observed.clear()
  }

  /** 模拟这些元素进入视口。 */
  enter(elements: Element[]): void {
    this.callback(
      elements.map(target => ({ target, isIntersecting: true }) as IntersectionObserverEntry),
      this as unknown as IntersectionObserver,
    )
  }
}

beforeEach(() => {
  FakeIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  document.body.innerHTML = '<div class="section" id="a"></div><div class="section" id="b"></div>'
})

afterEach(() => {
  teardownScrollReveal()
  vi.unstubAllGlobals()
})

const latest = () => FakeIntersectionObserver.instances.at(-1)

describe('开启', () => {
  it('给目标元素加上待揭示的类并开始观察', () => {
    syncScrollReveal(true)
    expect(document.querySelectorAll('.tj-reveal')).toHaveLength(2)
    expect(latest()?.observed.size).toBe(2)
  })

  it('进入视口后加上已揭示的类', () => {
    syncScrollReveal(true)
    const target = document.querySelector('#a')!
    latest()?.enter([target])
    expect(target.classList.contains('tj-revealed')).toBe(true)
  })

  it('只揭示一次，之后不再观察该元素', () => {
    syncScrollReveal(true)
    const target = document.querySelector('#a')!
    latest()?.enter([target])
    expect(latest()?.observed.has(target)).toBe(false)
    expect(latest()?.observed.size).toBe(1)
  })

  it('页面上没有目标元素时不建观察器', () => {
    document.body.innerHTML = ''
    syncScrollReveal(true)
    expect(hasScrollRevealObserver()).toBe(false)
  })
})

describe('关闭', () => {
  it('把已加的类清干净', () => {
    /*
     * 不清理的话元素会停在透明状态再也不出现——关掉特效反而让内容消失，
     * 这是最糟的一种坏法。
     */
    syncScrollReveal(true)
    expect(document.querySelectorAll('.tj-reveal')).toHaveLength(2)

    syncScrollReveal(false)
    expect(document.querySelectorAll('.tj-reveal')).toHaveLength(0)
    expect(document.querySelectorAll('.tj-revealed')).toHaveLength(0)
  })

  it('断开观察器，不留监听', () => {
    syncScrollReveal(true)
    const observer = latest()
    syncScrollReveal(false)
    expect(observer?.disconnected).toBe(true)
    expect(hasScrollRevealObserver()).toBe(false)
  })

  it('已揭示的元素在关闭后也回到正常状态', () => {
    syncScrollReveal(true)
    const target = document.querySelector('#a')!
    latest()?.enter([target])
    syncScrollReveal(false)
    expect(target.classList.contains('tj-revealed')).toBe(false)
  })
})

describe('重复同步', () => {
  it('连续开启不会叠加观察器', () => {
    syncScrollReveal(true)
    const first = latest()
    syncScrollReveal(true)
    expect(first?.disconnected).toBe(true)
    expect(document.querySelectorAll('.tj-reveal')).toHaveLength(2)
  })
})

describe('环境不支持时', () => {
  it('没有 IntersectionObserver 就安静跳过，不让整个特效运行时挂掉', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    expect(() => syncScrollReveal(true)).not.toThrow()
    expect(hasScrollRevealObserver()).toBe(false)
  })
})
