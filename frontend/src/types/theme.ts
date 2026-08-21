import type { JsonObject } from './common'

/**
 * 主题，对应后端 `ThemePresetService.ThemeView`。
 *
 * 三个 JSON 字段的关系是系统的核心约定，不要在前端自己重算：
 *   definitionJson         = deepMerge(officialDefinitionJson, overrideJson)，实际生效的那份
 *   officialDefinitionJson = 官方默认，builtin 主题只读
 *   overrideJson           = 用户改动，稀疏结构；还原默认 = 清空它
 */
export interface ThemeView {
  id: number
  themeKey: string
  name: string
  description: string | null
  baseThemeKey: string
  previewImageUrl: string | null
  definitionJson: JsonObject
  builtin: boolean
  enabled: boolean
  version: number
  officialDefinitionJson: JsonObject | null
  overrideJson: JsonObject | null
  /** 用户覆盖了多少个字段。Studio 用它提示「已改动 N 项」。 */
  customizedCount: number
}

/** 全站主题跟随季节还是锁定一套。 */
export type ThemeMode = 'AUTO' | 'FIXED'

/** 明暗基调。决定阴影用主色还是纯黑。 */
export type ColorScheme = 'light' | 'dark'

/** 字体族。取值来自后端 SCHEMA 的 option，前端各有一套具体字体栈。 */
export type FontFamilyName = 'serif' | 'sans' | 'rounded' | 'mono'

export interface ThemeColors {
  background?: string
  surface?: string
  surfaceSoft?: string
  primary?: string
  primarySoft?: string
  secondary?: string
  accent?: string
  accentHover?: string
  sand?: string
  text?: string
  muted?: string
  border?: string
  danger?: string
  gradientFrom?: string
  gradientTo?: string
  scheme?: ColorScheme
}

/** 一枚主题贴纸。asset 只是素材名，最终拼成站内固定路径，配置里不出现任意 URL。 */
export interface StickerItem {
  asset?: string
  area?: string
}

/**
 * 主题定义。
 *
 * 刻意保留索引签名：绝大多数 token 走「section-key → CSS 变量 / data-* 属性」的
 * 通用映射，后端 SCHEMA 加一项前端不需要改代码。下面具名的几个是有专门处理逻辑
 * 的例外——派生阴影、拼 url()、生成贴纸 DOM 等。
 */
export interface ThemeDefinition {
  colors?: ThemeColors
  typography?: {
    headingFamily?: FontFamilyName
    bodyFamily?: FontFamilyName
    lineHeight?: number
    [key: string]: unknown
  }
  shape?: {
    cardRadius?: number
    buttonRadius?: number
    [key: string]: unknown
  }
  layout?: {
    homeLayout?: string
    [key: string]: unknown
  }
  motion?: { level?: string; [key: string]: unknown }
  map?: { routeColor?: string; [key: string]: unknown }
  /** 首页封面图。只认 media id，前端据此拼站内地址。 */
  hero?: { mediaId?: number; [key: string]: unknown }
  background?: { mediaId?: number; [key: string]: unknown }
  stickers?: { density?: string; items?: StickerItem[]; [key: string]: unknown }
  [section: string]: unknown
}

/** 归一化之后的主题。apply / current / stored 之间传的就是它。 */
export interface AppliedTheme {
  /**
   * 主题标识。刻意保持可选：normalize 传对象时不给它兜底，缺席的场合由
   * baseThemeKey 顶上。改成必填会让落盘的配置和 current() 的返回值都变形。
   */
  themeKey?: string
  /** 基础视觉，必定是 supportedBases 里的一个。 */
  baseThemeKey: string
  definitionJson: ThemeDefinition
  [key: string]: unknown
}

/** apply 能接受的入参：主题 key、完整主题对象，或什么都没有。 */
export type ThemeInput = string | Partial<AppliedTheme> | ThemeView | null | undefined

/**
 * 交给 TravelMap 的地图样式参数。
 *
 * Theme 不认识 AMap 或 Leaflet 的 API，只给语义参数，具体怎么画由 Provider 适配层决定。
 */
export interface MapTokens {
  style: string
  color: string | undefined
  width: number | undefined
  markerStyle: string
  animateRoute: boolean
}
