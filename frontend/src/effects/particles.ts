/*
 * 主题粒子层。
 *
 * 纯 CSS 做不了的那部分特效，读的是 theme 铺在 <html> 上的 data-effects-*
 * 属性，所以主题一切换就自动跟着变。
 *
 * 三条自我约束：
 *  1. 默认全关，只有主题显式开启才跑；
 *  2. 尊重系统的「减少动态效果」，也尊重页面隐藏（切到后台标签就停）；
 *  3. 粒子数量按视口面积算并封顶，别让弱机器掉帧。
 */

export type ParticleKind = 'snow' | 'sakura' | 'leaves' | 'stars' | 'dust'

export interface ParticleSpec {
  /** 每平方像素的粒子数，乘视口面积得到目标数量。 */
  density: number
  size: [number, number]
  /** 下落速度区间。上界为 0 表示这种粒子不下落（星星）。 */
  fall: [number, number]
  drift: number
  spin: number
  color: string
}

export interface Particle {
  x: number
  y: number
  size: number
  speed: number
  drift: number
  angle: number
  spin: number
  alpha: number
  /** 0..1 的随机量，用来在同一种粒子里做出深浅变化。 */
  variant: number
}

/** 每种粒子的形态参数：数量系数、大小、下落速度、横向漂移、旋转、颜色。 */
export const PARTICLE_KINDS: Record<ParticleKind, ParticleSpec> = {
  snow: { density: 0.000045, size: [5, 10], fall: [18, 46], drift: 26, spin: 0.35, color: 'rgba(255,255,255,.86)' },
  sakura: { density: 0.000034, size: [6, 11], fall: [22, 50], drift: 44, spin: 1.6, color: 'rgba(255,183,197,.82)' },
  leaves: { density: 0.000026, size: [7, 13], fall: [26, 58], drift: 52, spin: 2.1, color: 'rgba(196,140,66,.78)' },
  stars: { density: 0.000075, size: [1, 2.4], fall: [0, 0], drift: 0, spin: 0, color: 'rgba(255,255,255,.9)' },
  dust: { density: 0.00006, size: [1, 3], fall: [6, 20], drift: 34, spin: 0, color: 'rgba(255,240,214,.5)' },
}

/**
 * 用 hasOwn 而不是 `in` 或真值判断：`in` 会走原型链，'toString' 之类会被当成
 * 合法种类，随后取 spec.density 拿到 undefined，粒子数算成 NaN。
 */
export function isParticleKind(value: unknown): value is ParticleKind {
  return typeof value === 'string' && Object.hasOwn(PARTICLE_KINDS, value)
}

/** 粒子数量上限。一次长途视口再大也不该无限生成，弱机器上会直接掉帧。 */
export const MAX_PARTICLES = 220

function random(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

export function targetCount(kind: ParticleKind, width: number, height: number): number {
  return Math.min(MAX_PARTICLES, Math.round(width * height * PARTICLE_KINDS[kind].density))
}

export function spawn(kind: ParticleKind, width: number, height: number, seeded: boolean): Particle {
  const spec = PARTICLE_KINDS[kind]
  return {
    x: Math.random() * width,
    // 首次铺满时随机散布，之后新生的粒子从顶部进入
    y: seeded ? Math.random() * height : -random(10, 80),
    size: random(spec.size[0], spec.size[1]),
    speed: random(spec.fall[0], spec.fall[1]),
    drift: random(-spec.drift, spec.drift),
    angle: Math.random() * Math.PI * 2,
    spin: random(-spec.spin, spec.spin),
    alpha: random(0.45, 1),
    variant: Math.random(),
  }
}

/**
 * 推进一颗粒子。
 *
 * 从绘制里分出来是为了能测：canvas 在 jsdom 里没有 2d 上下文，但「掉到底部要
 * 回到顶上」「横向出界要绕回来」「星星只呼吸不下落」这些是纯计算，也正是会写错
 * 的地方。返回 true 表示这颗粒子该重新投放。
 */
export function stepParticle(
  particle: Particle,
  spec: ParticleSpec,
  delta: number,
  width: number,
  height: number,
  now: number,
): boolean {
  if (spec.fall[1] > 0) {
    particle.y += particle.speed * delta
    particle.x += Math.sin(particle.angle) * particle.drift * delta
    particle.angle += particle.spin * delta
    if (particle.y - particle.size > height) return true
    if (particle.x < -20) particle.x = width + 20
    if (particle.x > width + 20) particle.x = -20
    return false
  }
  // 星星不下落，只做呼吸式明暗
  particle.alpha += Math.sin(now / 900 + particle.angle) * 0.008
  particle.alpha = Math.max(0.15, Math.min(1, particle.alpha))
  return false
}

/** 两帧间隔。切标签回来时可能隔了很久，夹住上界避免一次跳一大步。 */
export function frameDelta(now: number, lastTime: number): number {
  return Math.min((now - lastTime) / 1000, 0.05)
}

/** 每种季节粒子都有自己的轮廓；颜色圆点只留给尘埃。 */
export function drawParticle(
  ctx: CanvasRenderingContext2D,
  kind: ParticleKind,
  p: Particle,
  spec: ParticleSpec,
): void {
  const size = p.size
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(p.angle)
  ctx.globalAlpha = p.alpha
  if (kind === 'snow') {
    ctx.strokeStyle = spec.color
    ctx.lineWidth = Math.max(0.7, size * 0.16)
    ctx.lineCap = 'round'
    for (let i = 0; i < 3; i++) {
      ctx.rotate(Math.PI / 3)
      ctx.beginPath()
      ctx.moveTo(-size / 2, 0)
      ctx.lineTo(size / 2, 0)
      ctx.moveTo(size * 0.22, 0)
      ctx.lineTo(size * 0.36, -size * 0.14)
      ctx.moveTo(size * 0.22, 0)
      ctx.lineTo(size * 0.36, size * 0.14)
      ctx.moveTo(-size * 0.22, 0)
      ctx.lineTo(-size * 0.36, -size * 0.14)
      ctx.moveTo(-size * 0.22, 0)
      ctx.lineTo(-size * 0.36, size * 0.14)
      ctx.stroke()
    }
  } else if (kind === 'sakura') {
    ctx.fillStyle = spec.color
    for (let i = 0; i < 5; i++) {
      ctx.rotate((Math.PI * 2) / 5)
      ctx.beginPath()
      ctx.ellipse(0, -size * 0.25, size * 0.22, size * 0.38, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(246,205,116,.9)'
    ctx.beginPath()
    ctx.arc(0, 0, size * 0.1, 0, Math.PI * 2)
    ctx.fill()
  } else if (kind === 'leaves') {
    ctx.fillStyle = p.variant > 0.55 ? 'rgba(181,91,43,.82)' : p.variant > 0.22 ? spec.color : 'rgba(219,166,70,.82)'
    ctx.beginPath()
    ctx.moveTo(0, -size * 0.55)
    ctx.bezierCurveTo(size * 0.55, -size * 0.3, size * 0.48, size * 0.34, 0, size * 0.58)
    ctx.bezierCurveTo(-size * 0.48, size * 0.34, -size * 0.55, -size * 0.3, 0, -size * 0.55)
    ctx.fill()
    ctx.strokeStyle = 'rgba(104,67,37,.42)'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(0, -size * 0.4)
    ctx.lineTo(0, size * 0.66)
    ctx.stroke()
  } else if (kind === 'stars') {
    ctx.fillStyle = spec.color
    ctx.beginPath()
    ctx.moveTo(0, -size)
    ctx.lineTo(size * 0.22, -size * 0.22)
    ctx.lineTo(size, 0)
    ctx.lineTo(size * 0.22, size * 0.22)
    ctx.lineTo(0, size)
    ctx.lineTo(-size * 0.22, size * 0.22)
    ctx.lineTo(-size, 0)
    ctx.lineTo(-size * 0.22, -size * 0.22)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.fillStyle = spec.color
    ctx.beginPath()
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
