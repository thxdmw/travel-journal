/*
 * 迁移兼容层：今日路线与回放。
 *
 * 消费方是 public-app.js（日记详情的当日路线）和 admin/moments.js（随手记回放）。
 *
 * 主题 token 和建图都从 window 取，不直接 import：地图和主题各自是独立产物，
 * import 会在本 bundle 里再打包一份模块实例——地图那份还带着自己的容器队列，
 * 同容器的串行保护会失效。
 *
 * TODO(迁移): 消费方迁到 SFC 后改为直接注入真实模块，删除本文件。
 */
import { STEP_MS, render, setMapTokensProvider } from '@/route/day-route'
import { setSimpleMapDeps, simpleMap } from '@/route/simple-map'

setMapTokensProvider(() => window.TravelTheme?.mapTokens?.() ?? {})

setSimpleMapDeps({
  create: (element, options) => window.TravelMap.create(element, options),
  mapStyle: () => window.TravelTheme?.mapTokens?.().style,
})

const dayRoute = { render, simpleMap, STEP_MS } as const

export type DayRouteGlobal = typeof dayRoute

declare global {
  interface Window {
    DayRoute: DayRouteGlobal
  }
}

window.DayRoute = dayRoute

export { dayRoute }
