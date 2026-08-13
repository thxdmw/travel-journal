import type { MapProvider, MapRuntime } from '@/types/map'

/** 用户手动选择的 Provider 存在这里。手动选择优先于 AUTO 判定。 */
const STORAGE_KEY = 'travel-map-provider'

/** 实际能建图的两个 Provider。AUTO 只是解析入口，不会出现在结果里。 */
export type ResolvedProvider = 'AMAP' | 'OSM'

export interface ProviderResolution {
  provider: ResolvedProvider
  /** manual 表示用户自己选的，auto 表示按访客网络国家码判定的。 */
  source: 'manual' | 'auto'
  region: string | null
}

/** 拿不到运行时配置时的兜底，保证地图至少能画出来。 */
const FALLBACK_RUNTIME: MapRuntime = {
  region: null,
  mapProvider: 'AMAP',
  amapJsKey: '',
  amapServiceHost: '/api/public/_AMapService',
  osmTileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  osmAttribution: '© OpenStreetMap contributors',
}

let runtimePromise: Promise<MapRuntime> | null = null

/**
 * 运行时配置。同一页面只请求一次——Provider 选择器和每一次建图都要用它。
 *
 * 这里不走 API 层：地图可能在 axios 还没加载完的时机初始化，而这个请求本身
 * 不需要凭据和拦截器。
 */
export function runtime(): Promise<MapRuntime> {
  if (!runtimePromise) {
    runtimePromise = fetch('/api/public/runtime')
      .then(response => response.json())
      .then((body: { data?: MapRuntime } & MapRuntime) => body.data ?? body)
      .catch(() => FALLBACK_RUNTIME)
  }
  return runtimePromise
}

export function manualProvider(): ResolvedProvider | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'AMAP' || value === 'OSM' ? value : null
  } catch {
    // 无痕模式等场景读不到，当作没选过
    return null
  }
}

/** 传 null 或非法值表示清除手动选择，回到 AUTO。 */
export function setManualProvider(value: unknown): void {
  try {
    if (value === 'AMAP' || value === 'OSM') localStorage.setItem(STORAGE_KEY, value)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 存不下就只影响这一次会话的选择，不影响地图本身
  }
}

/** 高德要有 JS Key 才能用；OSM 不需要配置，永远可用。 */
export function providerUsable(provider: unknown, config: MapRuntime | null | undefined): boolean {
  if (provider === 'AMAP') return !!(config?.amapJsKey && String(config.amapJsKey).trim())
  return provider === 'OSM'
}

/** 优先级：用户手动选择 > 运行时 AUTO 判定。手动选择的值不受 AUTO 结果影响。 */
export async function resolveProvider(): Promise<ProviderResolution> {
  const manual = manualProvider()
  if (manual) return { provider: manual, source: 'manual', region: null }

  const config = await runtime()
  const resolved: ResolvedProvider = config.mapProvider === 'OSM' ? 'OSM' : 'AMAP'
  /*
   * 缺 Key 不是「高德加载失败」，而是部署时就没有启用高德。AUTO 直接使用 OSM，
   * 避免每个访客都看到一个注定失败的重试提示；用户手动选高德仍会明确报配置错误。
   */
  const provider = resolved === 'AMAP' && !providerUsable('AMAP', config) ? 'OSM' : resolved
  return { provider, source: 'auto', region: config.region ?? null }
}

export type { MapProvider }

/** 仅供测试重置运行时缓存。 */
export function resetRuntimeForTest(): void {
  runtimePromise = null
}
