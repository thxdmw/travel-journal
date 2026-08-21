import type { FontFamilyName, ThemeColors } from '@/types/theme'

/**
 * 基础视觉只有 base 一种。
 *
 * 它不是一套可选主题，而是所有主题共用的 CSS 变量兜底层（styles/themes/base.css，
 * 挂在 `<html data-theme>` 上），主题自己的值由 theme.ts 用行内样式盖上去。
 *
 * 这个位置曾经叫 travel-classic，同时还是主题列表里的「远行手记」，一个 key 两种身份，
 * 「删掉这套主题」和「删掉所有主题的地基」看起来是同一件事。V32 把预设下线、底座改名，
 * 从此 base 只是底座。sanya-breeze 更早在 V6 就下线了。
 */
export const SUPPORTED_BASES = ['base'] as const

export const DEFAULT_BASE = 'base'

/** colors 区块不走通用映射（值都是十六进制色），单独列出各自的 CSS 变量名。 */
export const COLOR_VARIABLES: Record<keyof Omit<ThemeColors, 'scheme'>, string> = {
  background: '--tj-bg',
  surface: '--tj-surface',
  surfaceSoft: '--tj-surface-soft',
  primary: '--tj-primary',
  primarySoft: '--tj-primary-soft',
  secondary: '--tj-secondary',
  accent: '--tj-accent',
  accentHover: '--tj-accent-hover',
  sand: '--tj-sand',
  text: '--tj-text',
  muted: '--tj-muted',
  border: '--tj-border',
  danger: '--tj-danger',
  gradientFrom: '--tj-gradient-from',
  gradientTo: '--tj-gradient-to',
}

/**
 * 数值型 token 的单位。后端 SCHEMA 里新增数值项时，在这里补一行单位就能生效；
 * 变量名统一是 --tj-{section}-{key}（短横线化）。
 *
 * 没登记单位的数值不会被通用映射写出去——那些都有各自的专用逻辑（比如 bodySize
 * 要拼 px 又要参与别的变量），漏在这里反而会写出两份互相打架的值。
 */
export const NUMERIC_UNITS: Record<string, string> = {
  'typography-letterSpacing': 'em',
  'background-intensity': '',
  'map-routeWidth': 'px',
  'decorations-opacity': '',
  'ambient-intensity': '',
}

export const kebab = (name: string): string =>
  name.replace(/[A-Z]/g, character => '-' + character.toLowerCase())

/** 切换主题前要清掉的变量。数值项直接从 NUMERIC_UNITS 推导，避免两处各写一遍漏掉。 */
export const MANAGED_VARIABLES: string[] = [
  ...Object.values(COLOR_VARIABLES),
  '--tj-bg-glow',
  '--tj-shadow',
  '--tj-shadow-soft',
  '--tj-radius',
  '--tj-radius-small',
  '--tj-button-radius',
  '--tj-serif',
  '--tj-sans',
  '--tj-body-line-height',
  '--el-color-primary',
  '--el-color-primary-dark-2',
  '--el-border-color',
  '--el-border-radius-base',
  '--el-bg-color',
  '--el-fill-color-blank',
  '--el-text-color-primary',
  '--el-mask-color',
  '--tj-hero-image',
  '--tj-bg-image',
  '--tj-route-color',
  ...Object.keys(NUMERIC_UNITS).map(name => '--tj-' + kebab(name)),
]

const FONT_STACKS: Record<FontFamilyName, string> = {
  serif: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif',
  sans: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  rounded:
    '"PingFang SC", "Hiragino Maru Gothic GB", "Yuanti SC", "Quicksand", system-ui, sans-serif',
  mono: '"JetBrains Mono", "SFMono-Regular", Consolas, "Noto Sans Mono CJK SC", monospace',
}

export function fontStack(name: unknown, fallback: FontFamilyName): string {
  const stack = typeof name === 'string' ? FONT_STACKS[name as FontFamilyName] : undefined
  return stack ?? FONT_STACKS[fallback]
}

/**
 * 走通用映射的区块。colors 单独处理（要派生阴影等），其余全部按约定铺开。
 * 后面五个是 Theme Pack V2 新增的：装饰、分隔线、氛围、Block 皮肤和互动。
 */
export const GENERIC_SECTIONS = [
  'background',
  'motion',
  'effects',
  'map',
  'layout',
  'typography',
  'shape',
  'decorations',
  'dividers',
  'ambient',
  'blockStyles',
  'interactions',
  'stickers',
  'hero',
] as const

/** 切换主题前要清掉的 data-* 属性前缀，避免上一套主题的枚举值残留。 */
export const MANAGED_DATA_PREFIXES: string[] = [...GENERIC_SECTIONS, 'colors']

/** localStorage 里存主题的两个键。config 是完整对象，key 是纯字符串的历史兜底。 */
export const STORAGE_KEY = 'travel-theme'
export const STORAGE_CONFIG_KEY = 'travel-theme-config'

/** 主题应用完成后广播的事件名。贴纸这类结构化配置靠它触发重建。 */
export const THEME_APPLIED_EVENT = 'travel-theme-applied'
