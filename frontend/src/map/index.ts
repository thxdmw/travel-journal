import { createAMapTravelMap } from './amap'
import { loadAMapSdk } from './amap-sdk'
import { createLeafletTravelMap } from './leaflet'
import { resolveProvider, runtime } from './provider'
import type { TravelMapInstance, TravelMapOptions } from '@/types/travel-map'

/*
 * 地图适配层的对外入口。
 *
 * 业务代码不直接碰 Leaflet 或高德 JS API，统一通过 create() 拿到一个 provider
 * 无关的实例。
 *
 * 不做静默自动降级：provider 加载失败时 create() 会 reject，页面自己决定怎么
 * 提示用户、要不要换一个 provider 重试；不会替用户永久改掉已保存的手动选择。
 */

interface ContainerState {
  /** 同容器的建图串行排队。 */
  queue: Promise<void>
  instance: TravelMapInstance | null
  /** 每次 destroy 递增，用来让排队中的建图任务失效。 */
  generation: number
}

/*
 * 同一个 DOM 容器的建图必须串行。Provider 解析和 SDK 加载都是异步的，用户快速
 * 切换时两次 create() 会重叠，Leaflet 会抛「Map container already initialized」。
 * 在这里统一销毁前一实例并排队创建，业务页面不需要各自实现竞态保护。
 */
const containerStates = new WeakMap<HTMLElement, ContainerState>()

async function createProviderMap(
  element: HTMLElement,
  options?: TravelMapOptions,
): Promise<TravelMapInstance> {
  const config = await runtime()
  const opts: TravelMapOptions = {
    osmTileUrl: config.osmTileUrl ?? undefined,
    osmAttribution: config.osmAttribution ?? undefined,
    ...(options ?? {}),
  }
  // 显式指定 provider 时跳过解析，用于手动切换和失败重试
  const resolved = opts.provider ? { provider: opts.provider } : await resolveProvider()
  if (resolved.provider === 'AMAP') {
    const AMap = await loadAMapSdk(config)
    return createAMapTravelMap(AMap, element, opts)
  }
  return createLeafletTravelMap(element, opts)
}

export async function create(
  element: HTMLElement | null | undefined,
  options?: TravelMapOptions,
): Promise<TravelMapInstance | null> {
  if (!element) throw new Error('缺少地图容器')

  let state = containerStates.get(element)
  if (!state) {
    state = { queue: Promise.resolve(), instance: null, generation: 0 }
    containerStates.set(element, state)
  }
  const owned = state
  const generation = owned.generation

  const task = owned.queue
    .catch(() => undefined)
    .then(async () => {
      // 容器在排队期间已经被页面卸载，不再创建一张落在失效 DOM 上的地图
      if (generation !== owned.generation) return null
      owned.instance?.destroy()
      owned.instance = null

      const instance = await createProviderMap(element, options)

      /*
       * SDK / Provider 加载期间也可能发生路由切换。实例刚创建出来就立即释放，
       * 不留下 ResizeObserver、地图事件或瓦片请求。
       */
      if (generation !== owned.generation) {
        instance.destroy()
        return null
      }

      // 包一层幂等的 destroy：页面和本层都可能调它，第二次必须是空操作
      const destroyProvider = instance.destroy.bind(instance)
      let destroyed = false
      instance.destroy = () => {
        if (destroyed) return
        destroyed = true
        destroyProvider()
        if (owned.instance === instance) owned.instance = null
      }

      owned.instance = instance
      return instance
    })

  // 失败也要放行下一次重试；task 自身仍保留 rejection 给当前调用方显示失败提示
  owned.queue = task.then(
    () => undefined,
    () => undefined,
  )
  return task
}

/**
 * 按容器销毁当前实例，并让该容器上尚未完成的异步 create 失效。
 *
 * 失败提示里的「尝试另一个 Provider」是页面级临时重试，调用方不一定拿得到新实例，
 * 所以组件卸载时还需要这一层兜底清理。
 */
export function destroy(element: HTMLElement | null | undefined): void {
  const state = element ? containerStates.get(element) : null
  if (!state) return
  state.generation += 1
  state.instance?.destroy()
  state.instance = null
}

export { manualProvider, providerUsable, resolveProvider, runtime, setManualProvider } from './provider'
export { gcj02ToWgs84, wgs84ToGcj02 } from './coordinates'
