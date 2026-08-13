import { describe, expect, it } from 'vitest'
import {
  MAX_PARTICLES,
  PARTICLE_KINDS,
  frameDelta,
  isParticleKind,
  spawn,
  stepParticle,
  targetCount,
  type Particle,
} from '@/effects/particles'

describe('粒子种类', () => {
  it('五种季节粒子都在', () => {
    expect(Object.keys(PARTICLE_KINDS).sort()).toEqual(['dust', 'leaves', 'sakura', 'snow', 'stars'])
  })

  it('只有星星不下落', () => {
    for (const [kind, spec] of Object.entries(PARTICLE_KINDS)) {
      expect(spec.fall[1] > 0, kind).toBe(kind !== 'stars')
    }
  })

  it('识别未知种类', () => {
    expect(isParticleKind('snow')).toBe(true)
    expect(isParticleKind('none')).toBe(false)
    expect(isParticleKind(undefined)).toBe(false)
    // 别把原型链上的东西当成种类
    expect(isParticleKind('toString')).toBe(false)
  })
})

describe('数量按视口面积算并封顶', () => {
  it('大视口不会无限生成', () => {
    // 弱机器上粒子太多会直接掉帧，所以有硬上限
    expect(targetCount('stars', 10_000, 10_000)).toBe(MAX_PARTICLES)
  })

  it('手机视口只有个位数到几十', () => {
    const count = targetCount('snow', 390, 844)
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThan(MAX_PARTICLES)
  })

  it('面积越大数量越多', () => {
    expect(targetCount('snow', 1920, 1080)).toBeGreaterThan(targetCount('snow', 390, 844))
  })
})

describe('投放', () => {
  it('首次铺满时纵向随机散布在视口内', () => {
    for (let i = 0; i < 50; i++) {
      const particle = spawn('snow', 400, 800, true)
      expect(particle.y).toBeGreaterThanOrEqual(0)
      expect(particle.y).toBeLessThanOrEqual(800)
    }
  })

  it('后续补充的粒子从视口上方进入', () => {
    for (let i = 0; i < 50; i++) {
      expect(spawn('snow', 400, 800, false).y).toBeLessThan(0)
    }
  })

  it('尺寸落在该种类的区间里', () => {
    const spec = PARTICLE_KINDS.leaves
    for (let i = 0; i < 50; i++) {
      const particle = spawn('leaves', 400, 800, true)
      expect(particle.size).toBeGreaterThanOrEqual(spec.size[0])
      expect(particle.size).toBeLessThanOrEqual(spec.size[1])
    }
  })
})

function particle(overrides: Partial<Particle> = {}): Particle {
  return {
    x: 100,
    y: 100,
    size: 8,
    speed: 30,
    drift: 10,
    angle: 0,
    spin: 0.2,
    alpha: 0.8,
    variant: 0.5,
    ...overrides,
  }
}

describe('推进', () => {
  it('会下落的粒子随时间往下走', () => {
    const p = particle()
    stepParticle(p, PARTICLE_KINDS.snow, 0.05, 400, 800, 0)
    expect(p.y).toBeCloseTo(100 + 30 * 0.05)
  })

  it('掉出底部时报告需要重新投放', () => {
    const p = particle({ y: 900 })
    expect(stepParticle(p, PARTICLE_KINDS.snow, 0.05, 400, 800, 0)).toBe(true)
  })

  it('还在视口里时不需要重新投放', () => {
    expect(stepParticle(particle(), PARTICLE_KINDS.snow, 0.05, 400, 800, 0)).toBe(false)
  })

  it('横向飘出左边就从右边回来', () => {
    const p = particle({ x: -100, drift: 0 })
    stepParticle(p, PARTICLE_KINDS.snow, 0.05, 400, 800, 0)
    expect(p.x).toBe(420)
  })

  it('横向飘出右边就从左边回来', () => {
    const p = particle({ x: 500, drift: 0 })
    stepParticle(p, PARTICLE_KINDS.snow, 0.05, 400, 800, 0)
    expect(p.x).toBe(-20)
  })

  it('星星不移动，只做呼吸式明暗', () => {
    const p = particle({ angle: 1 })
    const before = { x: p.x, y: p.y }
    stepParticle(p, PARTICLE_KINDS.stars, 0.05, 400, 800, 1000)
    expect(p.x).toBe(before.x)
    expect(p.y).toBe(before.y)
    expect(p.alpha).not.toBe(0.8)
  })

  it('星星的透明度始终夹在可见区间内', () => {
    const p = particle({ alpha: 1 })
    for (let i = 0; i < 2000; i++) stepParticle(p, PARTICLE_KINDS.stars, 0.05, 400, 800, i * 16)
    expect(p.alpha).toBeGreaterThanOrEqual(0.15)
    expect(p.alpha).toBeLessThanOrEqual(1)
  })
})

describe('帧间隔', () => {
  it('正常帧按实际时间换算成秒', () => {
    expect(frameDelta(1016, 1000)).toBeCloseTo(0.016)
  })

  it('切标签回来隔了很久时夹住上界，不让粒子一次跳一大步', () => {
    expect(frameDelta(60_000, 1000)).toBe(0.05)
  })
})
