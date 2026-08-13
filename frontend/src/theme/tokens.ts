import type { FontFamilyName, ThemeColors } from '@/types/theme'

/**
 * 基础视觉目前只剩 travel-classic。原先的 sanya-breeze 相对它只多一张首页封面图，
 * 而封面图已经改成每套主题自己上传，于是在 V6 迁移里下线了。
 */
export const SUPPORTED_BASES = ['travel-classic'] as const

export const DEFAULT_BASE = 'travel-classic'

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
  'typography-headingWeight': '',
  'typography-paragraphSpacing': 'em',
  'shape-borderWidth': 'px',
  'layout-sectionGap': '',
  'card-opacity': '',
  'card-blur': 'px',
  'background-intensity': '',
  'image-maxHeight': 'vh',
  'gallery-columns': '',
  'gallery-gap': 'px',
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
  '--tj-image-radius',
  '--tj-button-radius',
  '--tj-serif',
  '--tj-sans',
  '--tj-body-size',
  '--tj-body-line-height',
  '--tj-content-width',
  '--tj-article-width',
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
  'card',
  'background',
  'image',
  'gallery',
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
