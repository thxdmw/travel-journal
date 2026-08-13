/*
 * 迁移兼容层：地图适配层。
 *
 * 消费方是 admin/trip-workspace.js 和后台路线相关脚本。
 *
 * TODO(迁移): 消费方迁到 SFC 后改为直接 import @/map，删除本文件。
 */
import {
  create,
  destroy,
  gcj02ToWgs84,
  manualProvider,
  providerUsable,
  resolveProvider,
  runtime,
  setManualProvider,
  wgs84ToGcj02,
} from '@/map'

const travelMap = {
  create,
  destroy,
  runtime,
  resolveProvider,
  manualProvider,
  setManualProvider,
  providerUsable,
  wgs84ToGcj02,
  gcj02ToWgs84,
} as const

export type TravelMapGlobal = typeof travelMap

declare global {
  interface Window {
    TravelMap: TravelMapGlobal
  }
}

window.TravelMap = travelMap

export { travelMap }
