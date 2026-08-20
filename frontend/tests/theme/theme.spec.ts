import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apply, current, mapTokens, normalize, resetActiveForTest, stored } from '@/theme/theme'
import type { ThemeDefinition } from '@/types/theme'

const root = () => document.documentElement

beforeEach(() => {
  root().removeAttribute('style')
  for (const name of Object.keys(root().dataset)) delete root().dataset[name]
  localStorage.clear()
  resetActiveForTest()
})

const withDefinition = (definitionJson: ThemeDefinition) => ({
  themeKey: 'custom',
  baseThemeKey: 'base',
  definitionJson,
})

describe('normalize', () => {
  it('空值退回基础主题', () => {
    expect(normalize(null)).toEqual({
      themeKey: 'base',
      baseThemeKey: 'base',
      definitionJson: {},
    })
  })

  it('字符串是已知基础视觉时直接用它', () => {
    expect(normalize('base')).toEqual({
      themeKey: 'base',
      baseThemeKey: 'base',
      definitionJson: {},
    })
  })

  it('字符串是自定义主题时基础视觉退回默认', () => {
    // 自定义主题的 key 不在 supportedBases 里，视觉底子仍是 base
    expect(normalize('my-autumn')).toEqual({
      themeKey: 'my-autumn',
      baseThemeKey: 'base',
      definitionJson: {},
    })
  })

  it('对象上不认识的 baseThemeKey 退回默认', () => {
    // sanya-breeze 在 V6 迁移里下线了，库里可能还有历史数据指着它
    const theme = normalize({ themeKey: 'x', baseThemeKey: 'sanya-breeze' })
    expect(theme.baseThemeKey).toBe('base')
  })

  it('对象缺 definitionJson 时补成空对象', () => {
    expect(normalize({ themeKey: 'x' }).definitionJson).toEqual({})
  })

  it('保留对象上的其余字段', () => {
    const theme = normalize({ themeKey: 'x', name: '秋日', builtin: true })
    expect(theme.name).toBe('秋日')
    expect(theme.builtin).toBe(true)
  })
})

describe('apply：颜色与派生值', () => {
  it('把颜色铺成 CSS 变量', () => {
    apply(withDefinition({ colors: { primary: '#264A3D', accent: '#C97B3F' } }))
    expect(root().style.getPropertyValue('--tj-primary')).toBe('#264A3D')
    expect(root().style.getPropertyValue('--tj-accent')).toBe('#C97B3F')
  })

  it('accentHover 缺席时由 accent 调暗派生', () => {
    apply(withDefinition({ colors: { accent: '#646464' } }))
    expect(root().style.getPropertyValue('--el-color-primary-dark-2')).toBe('#545454')
  })

  it('暗色基调改用纯黑阴影并加深', () => {
    // 暗色下用主色调阴影几乎看不见，卡片会糊成一片
    apply(withDefinition({ colors: { primary: '#264A3D', scheme: 'dark' } }))
    expect(root().style.getPropertyValue('--tj-shadow')).toContain('rgba(0,0,0,0.55)')
    expect(root().dataset.scheme).toBe('dark')
  })

  it('未声明 scheme 时按亮色处理', () => {
    apply(withDefinition({ colors: { primary: '#264A3D' } }))
    expect(root().style.getPropertyValue('--tj-shadow')).toContain('rgba(38,74,61,0.1)')
    expect(root().dataset.scheme).toBe('light')
  })

  it('地图路线色没单独设时跟随强调色', () => {
    apply(withDefinition({ colors: { accent: '#C97B3F' } }))
    expect(root().style.getPropertyValue('--tj-route-color')).toBe('#C97B3F')
  })

  it('地图路线色显式设置时优先于强调色', () => {
    apply(withDefinition({ colors: { accent: '#C97B3F' }, map: { routeColor: '#1A73E8' } }))
    expect(root().style.getPropertyValue('--tj-route-color')).toBe('#1A73E8')
  })
})

describe('apply：通用 token 映射', () => {
  it('登记过单位的数值铺成带单位的 CSS 变量', () => {
    apply(withDefinition({ card: { blur: 12, opacity: 0.8 } }))
    expect(root().style.getPropertyValue('--tj-card-blur')).toBe('12px')
    expect(root().style.getPropertyValue('--tj-card-opacity')).toBe('0.8')
  })

  it('驼峰键名转成短横线变量名', () => {
    apply(withDefinition({ map: { routeWidth: 4 } }))
    expect(root().style.getPropertyValue('--tj-map-route-width')).toBe('4px')
  })

  it('未登记单位的数值不写变量，避免和专用逻辑写出两份打架的值', () => {
    apply(withDefinition({ typography: { bodySize: 16 } }))
    expect(root().style.getPropertyValue('--tj-typography-body-size')).toBe('')
    // bodySize 有自己的专用逻辑
    expect(root().style.getPropertyValue('--tj-body-size')).toBe('16px')
  })

  it('枚举值铺成 data-* 属性', () => {
    apply(withDefinition({ effects: { particles: 'snow' } }))
    expect(root().dataset.effectsParticles).toBe('snow')
  })

  it('布尔值铺成 on / off', () => {
    apply(withDefinition({ map: { animateRoute: true }, motion: { scrollReveal: false } }))
    expect(root().dataset.mapAnimateRoute).toBe('on')
    expect(root().dataset.motionScrollReveal).toBe('off')
  })

  it('嵌套对象和 null 不参与通用映射', () => {
    apply(withDefinition({ stickers: { items: [{ asset: 'x', area: 'footer' }], density: 'light' } }))
    expect(root().dataset.stickersItems).toBeUndefined()
    expect(root().dataset.stickersDensity).toBe('light')
  })
})

describe('apply：切换主题不留残留', () => {
  it('上一套主题的 CSS 变量被清掉', () => {
    apply(withDefinition({ card: { blur: 12 } }))
    expect(root().style.getPropertyValue('--tj-card-blur')).toBe('12px')

    apply('base')
    expect(root().style.getPropertyValue('--tj-card-blur')).toBe('')
  })

  it('上一套主题的 data-* 枚举被清掉', () => {
    /*
     * 这是原实现注释里点名的坑：内置主题的配置里没有 card / effects 这些区块，
     * 不清理的话切回内置主题会残留前一套的玻璃卡片、雪花特效。
     */
    apply(withDefinition({ effects: { particles: 'snow' }, card: { style: 'glass' } }))
    expect(root().dataset.effectsParticles).toBe('snow')
    expect(root().dataset.cardStyle).toBe('glass')

    apply('base')
    expect(root().dataset.effectsParticles).toBeUndefined()
    expect(root().dataset.cardStyle).toBeUndefined()
  })

  it('清理不会误伤前缀同名但更短的属性', () => {
    // dataset.theme / dataset.motion 都是前缀本身，长度相等，不该被删
    apply(withDefinition({ motion: { level: 'lively' } }))
    expect(root().dataset.theme).toBe('base')
    expect(root().dataset.motion).toBe('lively')
  })
})

describe('apply：媒体变量只认 media id', () => {
  it('正整数 id 拼成站内地址', () => {
    apply(withDefinition({ hero: { mediaId: 42 }, background: { mediaId: 7 } }))
    expect(root().style.getPropertyValue('--tj-hero-image')).toBe("url('/api/media/42/display')")
    expect(root().style.getPropertyValue('--tj-bg-image')).toBe("url('/api/media/7/display')")
  })

  it('任意 URL、字符串、小数和非正数一律不写变量', () => {
    /*
     * 这两个值最终会进 CSS 的 url()，放开就是注入点。没设置时不写变量，
     * 让基础主题的兜底值生效。
     */
    const rejected = [
      "x'); background-image: url('http://evil.test/a.png",
      'http://evil.test/a.png',
      0,
      -1,
      1.5,
      null,
    ]
    for (const mediaId of rejected) {
      apply(withDefinition({ hero: { mediaId: mediaId as number } }))
      expect(root().style.getPropertyValue('--tj-hero-image'), String(mediaId)).toBe('')
    }
  })
})

describe('apply：持久化与广播', () => {
  it('默认落盘主题 key 与完整配置', () => {
    apply(withDefinition({ colors: { accent: '#C97B3F' } }))
    expect(localStorage.getItem('travel-theme')).toBe('custom')
    expect(JSON.parse(localStorage.getItem('travel-theme-config') ?? 'null')).toMatchObject({
      themeKey: 'custom',
      baseThemeKey: 'base',
    })
  })

  it('persist 为 false 时不落盘', () => {
    // Studio 的预览 iframe 靠它避免污染真实站点上次保存的主题
    apply(withDefinition({}), { persist: false })
    expect(localStorage.getItem('travel-theme')).toBeNull()
    expect(localStorage.getItem('travel-theme-config')).toBeNull()
  })

  it('应用完成后广播事件，带上归一化后的主题', () => {
    const listener = vi.fn()
    window.addEventListener('travel-theme-applied', listener)
    const theme = apply('my-autumn')
    window.removeEventListener('travel-theme-applied', listener)

    expect(listener).toHaveBeenCalledOnce()
    const event = listener.mock.calls[0]?.[0] as CustomEvent
    expect(event.detail).toEqual(theme)
  })

  it('current 返回最后一次应用的主题', () => {
    expect(current()).toBeNull()
    const theme = apply('my-autumn')
    expect(current()).toEqual(theme)
  })
})

describe('stored', () => {
  it('优先返回完整配置', () => {
    apply(withDefinition({ colors: { accent: '#C97B3F' } }))
    const restored = stored()
    expect(typeof restored).toBe('object')
    expect((restored as { themeKey?: string }).themeKey).toBe('custom')
  })

  it('配置坏掉时退回纯 key，不让整个页面失去主题', () => {
    localStorage.setItem('travel-theme-config', '{ 这不是 JSON')
    localStorage.setItem('travel-theme', 'my-autumn')
    expect(stored()).toBe('my-autumn')
  })

  it('什么都没有时给基础主题', () => {
    expect(stored()).toBe('base')
  })
})

describe('mapTokens', () => {
  it('没有任何配置时给出可用的默认值', () => {
    const tokens = mapTokens()
    expect(tokens.style).toBe('auto')
    expect(tokens.markerStyle).toBe('dot')
    expect(tokens.animateRoute).toBe(false)
  })

  it('读出主题铺下的地图 token', () => {
    apply(
      withDefinition({
        colors: { accent: '#C97B3F' },
        map: { routeWidth: 5, style: 'muted', markerStyle: 'pin', animateRoute: true },
      }),
    )
    const tokens = mapTokens()
    expect(tokens.style).toBe('muted')
    expect(tokens.markerStyle).toBe('pin')
    expect(tokens.animateRoute).toBe(true)
    expect(tokens.width).toBe(5)
    expect(tokens.color).toBe('#C97B3F')
  })
})
