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
