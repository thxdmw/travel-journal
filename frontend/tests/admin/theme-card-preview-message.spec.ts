import { isProxy, reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import { createThemeCardPreviewMessage } from '@/admin/theme-card-preview-message'
import type { ThemeView } from '@/types/theme'

function theme(): ThemeView {
  return {
    id: 2,
    themeKey: 'preset-spring',
    name: '春日漫游',
    description: '春日主题',
    baseThemeKey: 'travel-classic',
    previewImageUrl: null,
    definitionJson: { colors: { background: '#fff8f3', accent: '#e695a5' } },
    builtin: true,
    enabled: true,
    version: 3,
    officialDefinitionJson: null,
    overrideJson: null,
    customizedCount: 0,
  }
}

describe('主题卡片预览消息', () => {
  it('把 Vue 响应式主题转换为 postMessage 可克隆的普通对象', () => {
    const item = reactive(theme())
    expect(isProxy(item.definitionJson)).toBe(true)

    const message = createThemeCardPreviewMessage(item)

    expect(isProxy(message.theme.definitionJson)).toBe(false)
    expect(() => structuredClone(message)).not.toThrow()
    expect(message.theme).toEqual({
      themeKey: 'preset-spring',
      baseThemeKey: 'travel-classic',
      definitionJson: { colors: { background: '#fff8f3', accent: '#e695a5' } },
    })
  })
})
