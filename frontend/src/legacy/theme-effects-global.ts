/*
 * 迁移兼容层：主题特效运行时。
 *
 * 和前几个模块不同，这一份在加载时就有副作用——旧脚本是个 IIFE，加载即装监听器
 * 并同步一次，页面靠这个行为拿到首屏特效。所以这里也必须在导入时 install()。
 *
 * 对外只暴露 sync()，与旧实现一致。studio.js 在切换预览主题后会手动调它。
 *
 * TODO(迁移): 消费方迁到 SFC 后改为显式 install()，删除本文件。
 */
import { install, sync } from '@/effects/runtime'

const themeEffects = { sync } as const

export type ThemeEffectsGlobal = typeof themeEffects

declare global {
  interface Window {
    TravelThemeEffects: ThemeEffectsGlobal
  }
}

/*
 * 主题定义走 window.TravelTheme 而不是直接 import：这两个产物各自打包了一份
 * 主题模块，直接 import 读到的是本 bundle 里从未赋值的那个实例。旧实现读的
 * 也正是这个全局，行为一致。
 */
install({ currentDefinition: () => window.TravelTheme?.current()?.definitionJson })
window.TravelThemeEffects = themeEffects

export { themeEffects }
