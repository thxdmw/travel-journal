import { darker, rgba } from './color'
import {
  COLOR_VARIABLES,
  DEFAULT_BASE,
  GENERIC_SECTIONS,
  MANAGED_DATA_PREFIXES,
  MANAGED_VARIABLES,
  NUMERIC_UNITS,
  STORAGE_CONFIG_KEY,
  STORAGE_KEY,
  SUPPORTED_BASES,
  THEME_APPLIED_EVENT,
  fontStack,
  kebab,
} from './tokens'
import type {
  AppliedTheme,
  ColorScheme,
  MapTokens,
  ThemeColors,
  ThemeDefinition,
  ThemeInput,
} from '@/types/theme'

export interface ApplyOptions {
  /** 传 false 表示只应用不落盘。Studio 的预览 iframe 用它，避免污染真实站点的选择。 */
  persist?: boolean
}

/** 当前生效的主题。供需要读取 stickers 这类结构化配置的模块使用。 */
let active: AppliedTheme | null = null

function isBase(key: unknown): key is (typeof SUPPORTED_BASES)[number] {
  return typeof key === 'string' && (SUPPORTED_BASES as readonly string[]).includes(key)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 把各种入参形态统一成 AppliedTheme。基础视觉必定落在 SUPPORTED_BASES 里。 */
export function normalize(input: ThemeInput): AppliedTheme {
  if (!input) {
    return { themeKey: DEFAULT_BASE, baseThemeKey: DEFAULT_BASE, definitionJson: {} }
  }
  if (typeof input === 'string') {
    return {
      themeKey: input,
      baseThemeKey: isBase(input) ? input : DEFAULT_BASE,
      definitionJson: {},
    }
  }
  // 自定义主题的 baseThemeKey 指向它继承的基础视觉；themeKey 本身也可能就是基础视觉
  const base = isBase(input.baseThemeKey)
    ? input.baseThemeKey
    : isBase(input.themeKey)
      ? input.themeKey
      : DEFAULT_BASE
  const definition = (input.definitionJson ?? {}) as ThemeDefinition
  return { ...input, baseThemeKey: base, definitionJson: definition }
}

/**
 * 按统一约定把 token 铺成 CSS 变量和 data-* 属性：
 * 数值 → --tj-{section}-{key}（带单位），枚举/布尔 → <html data-{section}-{key}>。
 * 这样后端 SCHEMA 加一项，前端不用改代码，CSS 直接用新选择器接住即可。
 */
function applyGenericTokens(root: HTMLElement, definition: ThemeDefinition): void {
  for (const section of GENERIC_SECTIONS) {
    const values = definition[section]
    if (!isRecord(values)) continue
    for (const [key, value] of Object.entries(values)) {
      // mediaId 要拼成 url()，贴纸列表要生成 DOM，两者都走各自的专用逻辑
      if (value == null || key === 'mediaId' || typeof value === 'object') continue
      const name = section + '-' + key
      if (typeof value === 'number') {
        const unit = NUMERIC_UNITS[name]
        if (unit == null) continue // 未登记单位的数值走各自的专用逻辑
        root.style.setProperty('--tj-' + kebab(name), value + unit)
      } else {
        root.dataset[section + key.charAt(0).toUpperCase() + key.slice(1)] =
          typeof value === 'boolean' ? (value ? 'on' : 'off') : String(value)
      }
    }
  }
}

/**
 * 图片背景和首页封面都只认 media id 拼出站内地址，不接受任意 URL。
 *
 * 这两个值最终会进 CSS 的 url()，放开会变成注入点。没设置就不写变量，让基础主题兜底。
 */
function setMediaVariable(root: HTMLElement, variable: string, mediaId: unknown): void {
  if (Number.isInteger(mediaId) && (mediaId as number) > 0) {
    root.style.setProperty(variable, `url('/api/media/${mediaId as number}/display')`)
  }
}

/** 清掉上一套主题写过的变量和枚举属性。 */
function clearManaged(root: HTMLElement): void {
  MANAGED_VARIABLES.forEach(name => root.style.removeProperty(name))
  /*
   * 上一套主题写过的枚举值必须先清掉：内置主题的配置里没有 card/effects 这些区块，
   * 不清理的话切回内置主题会残留前一套的玻璃卡片、雪花特效之类。
   */
  for (const prefix of MANAGED_DATA_PREFIXES) {
    Object.keys(root.dataset)
      .filter(name => name.startsWith(prefix) && name.length > prefix.length)
      .forEach(name => delete root.dataset[name])
  }
}

function applyColors(root: HTMLElement, colors: ThemeColors): void {
  for (const [key, variable] of Object.entries(COLOR_VARIABLES)) {
    const value = colors[key as keyof typeof COLOR_VARIABLES]
    if (value) root.style.setProperty(variable, value)
  }
  if (colors.sand) {
    const glow = rgba(colors.sand, 0.3)
    if (glow) root.style.setProperty('--tj-bg-glow', glow)
  }
  if (colors.primary) {
    // 暗色基调下用主色调阴影几乎看不见，改用纯黑并加深，否则卡片会糊成一片
    const dark = colors.scheme === 'dark'
    const shadowBase = dark ? '#000000' : colors.primary
    const strong = dark ? 0.55 : 0.1
    const soft = dark ? 0.34 : 0.075
    root.style.setProperty('--tj-shadow', `0 14px 40px ${rgba(shadowBase, strong)}`)
    root.style.setProperty('--tj-shadow-soft', `0 5px 20px ${rgba(shadowBase, soft)}`)
  }
  // 明暗基调。colors 区块不走通用映射（值都是十六进制色），scheme 单独铺一次
  const scheme: ColorScheme = colors.scheme === 'dark' ? 'dark' : 'light'
  root.dataset.scheme = scheme
  if (colors.accent) {
    root.style.setProperty('--el-color-primary', colors.accent)
    root.style.setProperty('--el-color-primary-dark-2', colors.accentHover || darker(colors.accent))
  }
  if (colors.border) root.style.setProperty('--el-border-color', colors.border)
  if (colors.surface) {
    root.style.setProperty('--el-bg-color', colors.surface)
    root.style.setProperty('--el-fill-color-blank', colors.surface)
    // loading 遮罩默认是白色，压在暖色背景上会发突兀，这里跟着主题的内容背景走
    const mask = rgba(colors.surface, 0.82)
    if (mask) root.style.setProperty('--el-mask-color', mask)
  }
  if (colors.text) root.style.setProperty('--el-text-color-primary', colors.text)
}

function applyNamedTokens(root: HTMLElement, definition: ThemeDefinition): void {
  const typography = definition.typography ?? {}
  root.style.setProperty('--tj-serif', fontStack(typography.headingFamily, 'serif'))
  root.style.setProperty('--tj-sans', fontStack(typography.bodyFamily, 'sans'))
  if (typography.bodySize) root.style.setProperty('--tj-body-size', typography.bodySize + 'px')
  if (typography.lineHeight) {
    root.style.setProperty('--tj-body-line-height', String(typography.lineHeight))
  }

  const shape = definition.shape ?? {}
  if (shape.cardRadius != null) root.style.setProperty('--tj-radius', shape.cardRadius + 'px')
  if (shape.buttonRadius != null) {
    root.style.setProperty('--tj-radius-small', shape.buttonRadius + 'px')
    root.style.setProperty('--tj-button-radius', shape.buttonRadius + 'px')
    root.style.setProperty('--el-border-radius-base', shape.buttonRadius + 'px')
  }
  const layout = definition.layout ?? {}
  if (layout.contentWidth) root.style.setProperty('--tj-content-width', layout.contentWidth + 'px')
  if (layout.articleWidth) root.style.setProperty('--tj-article-width', layout.articleWidth + 'px')
  // density / homeLayout 沿用历史属性名，老 CSS 还在用；其余走通用映射
  root.dataset.density = layout.density || 'comfortable'
  root.dataset.homeLayout = layout.homeLayout || 'editorial'

  root.dataset.motion = definition.motion?.level || 'subtle'
}

function persist(theme: AppliedTheme): void {
  localStorage.setItem(STORAGE_KEY, theme.themeKey || theme.baseThemeKey)
  localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(theme))
}

/**
 * 把主题铺到 <html> 上。
 *
 * 这里只写 CSS 变量和 data-* 属性，不碰 DOM 结构——贴纸那种「一项配置对应一个元素」
 * 的需求由 theme-effects.js 接管，靠下面广播的事件触发。这条边界要守住，否则主题
 * 逻辑会慢慢长出一套自己的渲染层。
 */
export function apply(input: ThemeInput, options: ApplyOptions = {}): AppliedTheme {
  const theme = normalize(input)
  const root = document.documentElement

  clearManaged(root)
  root.dataset.theme = theme.baseThemeKey
  root.dataset.themeKey = theme.themeKey || theme.baseThemeKey

  const definition = theme.definitionJson ?? {}
  applyColors(root, definition.colors ?? {})

  // 地图路线色没单独设就跟随强调色，省得每套主题都要配一遍
  const routeColor = definition.map?.routeColor || definition.colors?.accent
  if (routeColor) root.style.setProperty('--tj-route-color', routeColor)

  applyNamedTokens(root, definition)
  applyGenericTokens(root, definition)
  setMediaVariable(root, '--tj-hero-image', definition.hero?.mediaId)
  setMediaVariable(root, '--tj-bg-image', definition.background?.mediaId)

  if (options.persist !== false) persist(theme)

  active = theme
  window.dispatchEvent(new CustomEvent(THEME_APPLIED_EVENT, { detail: theme }))
  return theme
}

/** 当前生效的主题。主题还没应用过时为 null。 */
export function current(): AppliedTheme | null {
  return active
}

/**
 * 上次保存的主题。
 *
 * 优先用完整配置，坏了就退回纯 key，再不行给基础主题——这条路径在首屏同步执行，
 * 一次 JSON 解析失败不该让整个页面失去主题。
 */
export function stored(): AppliedTheme | string {
  try {
    const raw = localStorage.getItem(STORAGE_CONFIG_KEY)
    const config = raw ? (JSON.parse(raw) as AppliedTheme | null) : null
    return config || localStorage.getItem(STORAGE_KEY) || DEFAULT_BASE
  } catch {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_BASE
  }
}

/**
 * 当前生效主题的地图相关 token，供路线渲染传给 TravelMap。
 *
 * 从计算样式读而不是从 definition 读：CSS 里的基础主题也会给这些变量兜底值，
 * 只看 definition 会漏掉没有显式配置的那部分。
 */
export function mapTokens(): MapTokens {
  const root = document.documentElement
  const style = getComputedStyle(root)
  const color = style.getPropertyValue('--tj-route-color').trim() || undefined
  const widthRaw = style.getPropertyValue('--tj-map-route-width').trim()
  const width = widthRaw ? parseFloat(widthRaw) : undefined
  return {
    style: root.dataset.mapStyle || 'auto',
    color,
    width: Number.isFinite(width) ? width : undefined,
    markerStyle: root.dataset.mapMarkerStyle || 'dot',
    animateRoute: root.dataset.mapAnimateRoute === 'on',
  }
}

/** 仅供测试重置模块状态。业务代码不要调。 */
export function resetActiveForTest(): void {
  active = null
}
