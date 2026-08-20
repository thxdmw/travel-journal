import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * 后台简易地图的依赖注入。
 *
 * simple-map 不直接 import 地图模块，是为了避免两个入口各自打包出两份实例——那样同一个
 * 容器的串行保护会失效。代价是必须有人在入口把依赖接上，而这一步曾经整个漏掉：simpleMap
 * 第一行 `if (!element || !deps) return null` 直接返回，调用方那层 catch 又是「后台失败就是
 * 没有地图，不弹提示」，于是随手记点「看路线」什么都不发生，控制台干干净净，藏了两轮。
 *
 * 页面级测试把 simpleMap 整个 mock 掉了，正好也测不到这里，所以这一份直接用真模块。
 */

/** deps 是模块级单例，每个用例都要拿一份干净的。 */
async function freshModule() {
  vi.resetModules()
  return import('@/route/simple-map')
}

describe('后台简易地图', () => {
  let element: HTMLElement

  beforeEach(() => {
    element = document.createElement('div')
    document.body.appendChild(element)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
  })

  it('没有人注入依赖就建不出地图', async () => {
    const { simpleMap } = await freshModule()

    // 这正是「看路线」失灵时的样子：没有地图，也没有任何报错
    expect(await simpleMap(element)).toBeNull()
  })

  it('注入之后用调用方给的容器建图', async () => {
    const { setSimpleMapDeps, simpleMap } = await freshModule()
    const map = { destroy: vi.fn(), invalidateSize: vi.fn() }
    const create = vi.fn().mockResolvedValue(map)
    setSimpleMapDeps({ create, mapStyle: () => 'ink' })

    const result = await simpleMap(element)

    expect(result).toBe(map)
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]?.[0]).toBe(element)
    // 主题选的地图样式要带下去，后台的地图不该和站点主题脱节
    expect(create.mock.calls[0]?.[1]).toMatchObject({ style: 'ink' })
    // 容器往往是刚插进 DOM 的，尺寸要等一帧才定下来
    expect(map.invalidateSize).toHaveBeenCalled()
  })

  it('建图失败仍然返回 null，由调用方决定怎么说', async () => {
    const { setSimpleMapDeps, simpleMap } = await freshModule()
    setSimpleMapDeps({ create: vi.fn().mockRejectedValue(new Error('地图库没加载出来')), mapStyle: () => undefined })

    await expect(simpleMap(element)).resolves.toBeNull()
  })

  it('没有容器就不必惊动地图模块', async () => {
    const { setSimpleMapDeps, simpleMap } = await freshModule()
    const create = vi.fn()
    setSimpleMapDeps({ create, mapStyle: () => undefined })

    expect(await simpleMap(null)).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  /*
   * 上面几条都只证明这个模块自己没毛病，而真正出过事的是「没有人调用 setSimpleMapDeps」。
   * 那是一行接线，任何单元测试都覆盖不到，只能直接盯着入口文件。
   */
  it('后台入口把依赖接上了', async () => {
    // jsdom 里 import.meta.url 不是 file: 协议，用 vitest 的工作目录（frontend）定位
    const entry = resolve(process.cwd(), 'src/entries/admin.ts')

    const source = await readFile(entry, 'utf8')

    expect(source).toContain('setSimpleMapDeps')
  })
})
