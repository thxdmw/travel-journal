import type { ThemeView } from '@/types/theme'

export interface ThemeCardPreviewMessage {
  type: 'travel-theme-preview'
  theme: Pick<ThemeView, 'themeKey' | 'baseThemeKey' | 'definitionJson'>
}

/**
 * Vue 会把主题列表递归转换成 Proxy，而 postMessage 的结构化克隆不能复制 Proxy。
 * 通过 JSON 往返只保留后端主题 DTO 中可传输的数据，避免卡片静默停在默认主题。
 */
export function createThemeCardPreviewMessage(item: ThemeView): ThemeCardPreviewMessage {
  return {
    type: 'travel-theme-preview',
    theme: JSON.parse(JSON.stringify({
      themeKey: item.themeKey,
      baseThemeKey: item.baseThemeKey,
      definitionJson: item.definitionJson,
    })) as ThemeCardPreviewMessage['theme'],
  }
}
