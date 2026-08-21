import {
  PARTICLE_KINDS,
  drawParticle,
  frameDelta,
  isParticleKind,
  spawn,
  stepParticle,
  targetCount,
  type Particle,
  type ParticleKind,
} from './particles'
import { syncScrollReveal, teardownScrollReveal } from './scroll-reveal'
import { effectLayer, syncStickers } from './stickers'
import { THEME_APPLIED_EVENT } from '@/theme/tokens'
import type { ThemeDefinition } from '@/types/theme'

/*
 * 特效运行时的装配层：画布生命周期、各监听器，以及「主题一变就重新同步」。
 *
 * 状态全部收在这里，粒子物理、揭示观察器和贴纸生成都在各自的模块里，
 * 那三块不碰全局状态，所以能单独测。
 */

/**
 * 当前主题定义的来源，由 install() 注入。
 *
 * 特效运行时不直接依赖主题状态，由每个页面入口注入当前定义。这样预览页可以
 * 使用独立主题，运行时也能在测试里接收任意定义。
 */
export type DefinitionProvider = () => ThemeDefinition | null | undefined

let currentDefinition: DefinitionProvider = () => null

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let particles: Particle[] = []
let rafId = 0
let lastTime = 0
let currentKind: ParticleKind | 'none' = 'none'

/** 系统的「减少动态效果」。环境没有 matchMedia 时当作没开启。 */
function reducedMotion(): MediaQueryList | null {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null
}

function prefersReducedMotion(): boolean {
  return reducedMotion()?.matches === true
}

function resize(): void {
  if (!canvas || !ctx) return
  // 超过 2 倍就没必要了，再高只是白烧 GPU
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.floor(window.innerWidth * ratio)
  canvas.height = Math.floor(window.innerHeight * ratio)
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
}

function draw(now: number): void {
  if (!ctx || currentKind === 'none') return
  const spec = PARTICLE_KINDS[currentKind]
  const delta = frameDelta(now, lastTime)
  lastTime = now
  const width = window.innerWidth
  const height = window.innerHeight
  ctx.clearRect(0, 0, width, height)

  for (const particle of particles) {
    if (stepParticle(particle, spec, delta, width, height, now)) {
      Object.assign(particle, spawn(currentKind, width, height, false))
    }
    drawParticle(ctx, currentKind, particle, spec)
  }
  ctx.globalAlpha = 1
  rafId = requestAnimationFrame(draw)
}

export function stopParticles(): void {
  cancelAnimationFrame(rafId)
  rafId = 0
  particles = []
  if (canvas) {
    canvas.remove()
    canvas = null
    ctx = null
  }
}

export function startParticles(kind: ParticleKind | 'none'): void {
  stopParticles()
  currentKind = kind
  if (kind === 'none' || prefersReducedMotion()) return

  const element = document.createElement('canvas')
  element.className = 'tj-particle-canvas'
  // 没有 2d 上下文就安静退出：老浏览器和某些测试环境拿不到，不该整页报错
  const context = element.getContext('2d')
  if (!context) return

  canvas = element
  ctx = context
  effectLayer().appendChild(canvas)
  resize()
  particles = Array.from({ length: targetCount(kind, window.innerWidth, window.innerHeight) }, () =>
    spawn(kind, window.innerWidth, window.innerHeight, true),
  )
  lastTime = performance.now()
  rafId = requestAnimationFrame(draw)
}

function syncParticles(): void {
  const raw = document.documentElement.dataset.effectsParticles
  const kind: ParticleKind | 'none' = isParticleKind(raw) ? raw : 'none'
  // 已经是这个形态而且还在跑，就不要白重启一次动画
  if (kind === currentKind && (kind === 'none' || rafId)) return
  startParticles(kind)
}

function syncReveal(): void {
  const on = document.documentElement.dataset.motionScrollReveal === 'on' && !prefersReducedMotion()
  syncScrollReveal(on)
}

function syncStickersFromTheme(): void {
  syncStickers(currentDefinition())
}

/**
 * 特效层的存亡。
 *
 * 胶片颗粒、漏光、光晕、缓慢移动层这四项的 CSS 全部挂在 .tj-effect-layer 上，可这个层
 * 原先只有粒子和贴纸会去创建——于是单开一个「漏光」或者「阳光光晕」，页面上什么都不会
 * 发生，主题里那几个开关看着像是坏的。这里按这四项自己的开关来决定层在不在。
 *
 * 缓慢移动层单独用一个子元素承载，不能跟胶片颗粒挤同一个 ::before：两者抢同一个伪元素
 * 时后加载的 theme-pack.css 会赢，同时开启就只剩云在飘，颗粒没了。
 */
function syncEffectLayer(): void {
  const flags = document.documentElement.dataset
  const drift = Boolean(flags.ambientDrift && flags.ambientDrift !== 'none')
  const wanted = drift
    || Boolean(flags.ambientGlow && flags.ambientGlow !== 'none')
    || flags.effectsGrain === 'on'
    || flags.effectsLightLeak === 'on'
  const layer = wanted ? effectLayer() : document.querySelector<HTMLElement>('.tj-effect-layer')
  if (!layer) return

  const existing = layer.querySelector('.tj-ambient-drift')
  if (drift && !existing) {
    const element = document.createElement('div')
    element.className = 'tj-ambient-drift'
    element.setAttribute('aria-hidden', 'true')
    layer.appendChild(element)
  } else if (!drift && existing) {
    existing.remove()
  }
  // 粒子画布和贴纸也住在这一层里，都散了才收摊
  if (!wanted && !layer.childElementCount) layer.remove()
}

export function sync(): void {
  syncParticles()
  syncReveal()
  syncStickersFromTheme()
  syncEffectLayer()
}

/** 本运行时自己增删的节点。内容观察器要忽略它们，否则会自己触发自己。 */
function isManagedNode(node: Node): boolean {
  return (
    node.nodeType === 1 &&
    (node as Element).matches?.('.tj-effect-layer,.tj-particle-canvas,.tj-sticker,.tj-ambient-drift') === true
  )
}

let installed = false

export interface InstallOptions {
  /** 当前主题定义从哪里取。见 DefinitionProvider 的说明。 */
  currentDefinition: DefinitionProvider
}

/** 装上全部监听器并同步一次。重复调用无副作用。 */
export function install(options: InstallOptions): void {
  currentDefinition = options.currentDefinition
  if (installed) return
  installed = true

  // <html> 上的 data-* 一变就重新同步，主题切换不需要刷新页面
  new MutationObserver(sync).observe(document.documentElement, {
    attributes: true,
    attributeFilter: [
      'data-effects-particles',
      'data-motion-scroll-reveal',
      'data-stickers-density',
      'data-interactions-sticker-click',
      // 这四项决定特效层在不在，见 syncEffectLayer
      'data-effects-grain',
      'data-effects-light-leak',
      'data-ambient-glow',
      'data-ambient-drift',
    ],
  })

  // 贴纸列表不是 data-* 属性（它是个数组），所以额外听一次主题应用完成
  window.addEventListener(THEME_APPLIED_EVENT, syncStickersFromTheme)

  /*
   * Vue 会在主题已经应用之后才把日记正文放进 DOM。只监听 <html> 属性会让内容锚点
   * 永远错过章节和图片，因此在结构真正出现后再补一次；忽略本运行时自己增删的节点，
   * 避免贴纸同步触发观察器、观察器又触发贴纸同步的循环。
   */
  let contentSyncTimer: ReturnType<typeof setTimeout> | undefined
  const contentObserver = new MutationObserver(mutations => {
    const meaningful = mutations.some(mutation =>
      [...mutation.addedNodes, ...mutation.removedNodes].some(
        node => node.nodeType === 1 && !isManagedNode(node),
      ),
    )
    if (!meaningful) return
    clearTimeout(contentSyncTimer)
    contentSyncTimer = setTimeout(() => {
      syncReveal()
      syncStickersFromTheme()
    }, 0)
  })
  if (document.body) contentObserver.observe(document.body, { childList: true, subtree: true })

  window.addEventListener('resize', () => {
    resize()
    if (currentKind !== 'none') startParticles(currentKind)
  })

  // 切到后台标签就停，别在看不见的地方空转耗电
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId)
      rafId = 0
    } else if (currentKind !== 'none' && canvas) {
      lastTime = performance.now()
      rafId = requestAnimationFrame(draw)
    }
  })

  reducedMotion()?.addEventListener('change', sync)

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync)
  else sync()
}

/** 仅供测试重置模块状态。 */
export function resetForTest(): void {
  stopParticles()
  teardownScrollReveal()
  currentKind = 'none'
  currentDefinition = () => null
}
