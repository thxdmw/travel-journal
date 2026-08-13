/*
 * 高德 JS API 2.0 的最小类型描述与动态加载。
 *
 * 只描述我们实际用到的那部分。引官方 d.ts 会把整套 SDK 的类型拉进来，而适配层
 * 用到的不过是地图、标记、折线和信息窗四样。
 */
import type { MapRuntime } from '@/types/map'

export interface AMapLngLat {
  getLat?: () => number
  getLng?: () => number
  lat?: number
  lng?: number
}

export interface AMapOverlay {
  setMap(map: unknown): void
}

export interface AMapMarker extends AMapOverlay {
  getPosition(): AMapLngLat
  on(event: string, handler: () => void): void
}

export interface AMapPolyline extends AMapOverlay {
  setPath(path: number[][]): void
}

export interface AMapInfoWindow {
  setContent(content: string): void
  open(map: unknown, position: AMapLngLat): void
  close(): void
}

export interface AMapMapInstance {
  destroy(): void
  setCenter(position: number[]): void
  panTo(position: number[]): void
  resize?: () => void
  getZoom(): number
  setZoom(zoom: number): void
  setMapStyle(style: string): void
  setBounds(bounds: unknown, immediately: boolean): void
  on(event: string, handler: (event: { lnglat: AMapLngLat }) => void): void
}

export interface AMapNamespace {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => AMapMapInstance
  Marker: new (options: Record<string, unknown>) => AMapMarker
  Polyline: new (options: Record<string, unknown>) => AMapPolyline
  InfoWindow: new (options: Record<string, unknown>) => AMapInfoWindow
  Pixel: new (x: number, y: number) => unknown
  Bounds: new (southWest: number[], northEast: number[]) => unknown
}

declare global {
  interface Window {
    AMap?: AMapNamespace
    /** 必须在加载 SDK 前设置，见下方说明。 */
    _AMapSecurityConfig?: { serviceHost: string }
  }
}

let amapScriptPromise: Promise<AMapNamespace> | null = null

export function loadAMapSdk(config: MapRuntime): Promise<AMapNamespace> {
  if (window.AMap) return Promise.resolve(window.AMap)
  if (amapScriptPromise) return amapScriptPromise

  amapScriptPromise = new Promise<AMapNamespace>((resolve, reject) => {
    if (!config.amapJsKey) {
      amapScriptPromise = null
      reject(new Error('未配置高德 Web端(JS API) Key'))
      return
    }
    const serviceHost = new URL(
      config.amapServiceHost || '/api/public/_AMapService',
      location.origin,
    ).href.replace(/\/$/, '')
    /*
     * 必须在加载 SDK 前设置。浏览器只拿到代理地址，真正的 securityJsCode 由服务端
     * 追加——密钥不能出现在前端。
     */
    window._AMapSecurityConfig = { serviceHost }

    const script = document.createElement('script')
    script.src = 'https://webapi.amap.com/maps?v=2.0&key=' + encodeURIComponent(config.amapJsKey)
    script.onload = () => {
      if (window.AMap) {
        resolve(window.AMap)
      } else {
        // 脚本回来了但没建立命名空间，多半是 Key 无效被服务端拒了
        amapScriptPromise = null
        reject(new Error('高德地图 SDK 未完成初始化'))
      }
    }
    script.onerror = () => {
      amapScriptPromise = null
      reject(new Error('高德地图脚本加载失败'))
    }
    document.head.appendChild(script)
  })
  return amapScriptPromise
}

/** 两个 Provider 只保持风格语义相近，不追求像素一致。 */
export function amapStyle(style: string | undefined): string {
  const schemeDark = document.documentElement.dataset.scheme === 'dark'
  /*
   * whitesmoke 是近灰白低饱和样式，会让 AUTO/浅色主题看起来像地图没有颜色。
   * 浅色语义使用高德标准彩色底图；只有暗色、复古、地形增强选择专用样式。
   */
  const key = style === 'auto' ? (schemeDark ? 'dark' : 'normal') : style
  const names: Record<string, string> = {
    normal: 'normal',
    dark: 'dark',
    light: 'normal',
    vintage: 'macaron',
    terrain: 'fresh',
  }
  return 'amap://styles/' + (names[key ?? ''] ?? 'normal')
}

/** 仅供测试重置加载状态。 */
export function resetSdkForTest(): void {
  amapScriptPromise = null
}
