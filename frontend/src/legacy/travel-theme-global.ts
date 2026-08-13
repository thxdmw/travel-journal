/*
 * 迁移兼容层：把 TS 主题模块重新拼成旧的 `window.TravelTheme` 形状。
 *
 * 消费方目前有 public-app.js、admin/shared.js、admin/studio.js、theme-effects.js、
 * day-route.js。其中 theme-effects.js 读的是 `current()?.definitionJson.stickers`，
 * day-route.js 读 `mapTokens()`——两者都还没迁，契约必须原样保留。
 *
 * TODO(迁移): 每有一个消费方迁到 SFC，就让它直接从 @/theme 导入；
 * 全部迁完后删除本文件，不保留 window 全局。
 */
import { apply, current, mapTokens, normalize, stored } from '@/theme/theme'
import { SUPPORTED_BASES } from '@/theme/tokens'

const travelTheme = {
  apply,
  normalize,
  stored,
  current,
  // 旧代码拿到的是一个普通数组，保持可变形态以免某处 push 之类的用法突然报错
  supportedBases: [...SUPPORTED_BASES],
  mapTokens,
} as const

export type TravelThemeGlobal = typeof travelTheme

declare global {
  interface Window {
    TravelTheme: TravelThemeGlobal
  }
}

window.TravelTheme = travelTheme

export { travelTheme }
