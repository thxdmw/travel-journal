import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Service Worker 的图片缓存策略。
 *
 * 这里要证明的是一条隐私边界：一张已经公开、已经被缓存的照片，作者撤回发布之后，
 * 不能再从本地缓存里被拿出来。以前这里是纯 cache-first——图片内容不变，看着很合理，
 * 但权限是会变的，撤回就变成了一个没有效果的操作。
 *
 * service-worker.js 不是模块（它要能被浏览器当脚本直接注册），所以用受控 sandbox 加载，
 * 把 self / caches / fetch 换成可观察的替身。
 */

interface Listeners { [type: string]: (event: unknown) => void }

/** 一个够用的 Cache 替身：键按 URL 存，行为和真实 Cache Storage 一致的部分才实现。 */
class FakeCache {
  store = new Map<string, Response>()
  private key(request: Request | string) { return typeof request === 'string' ? request : request.url }
  match(request: Request | string) { return Promise.resolve(this.store.get(this.key(request))) }
  put(request: Request | string, response: Response) { this.store.set(this.key(request), response); return Promise.resolve() }
  delete(request: Request | string) { return Promise.resolve(this.store.delete(this.key(request))) }
  keys() { return Promise.resolve([...this.store.keys()].map(url => new Request(url))) }
  add() { return Promise.resolve() }
}

async function loadWorker(fetchImpl: typeof fetch) {
  const code = await readFile(resolve(process.cwd(), 'public/service-worker.js'), 'utf8')
  const listeners: Listeners = {}
  const buckets = new Map<string, FakeCache>()
  const workerSelf = {
    location: { href: 'https://travel.example/service-worker.js?build=test', origin: 'https://travel.example' },
    addEventListener: (type: string, handler: (event: unknown) => void) => { listeners[type] = handler },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  }
  const cacheStorage = {
    open: (name: string) => {
      if (!buckets.has(name)) buckets.set(name, new FakeCache())
      return Promise.resolve(buckets.get(name))
    },
    keys: () => Promise.resolve([...buckets.keys()]),
    delete: (name: string) => Promise.resolve(buckets.delete(name)),
  }
  // 被测脚本本身，不是外部输入
  new Function('self', 'caches', 'fetch', code)(workerSelf, cacheStorage, fetchImpl)
  return { listeners, cacheStorage }
}

/** 走一遍 fetch 事件，拿到 SW 打算回给页面的那个响应。 */
async function handle(listeners: Listeners, url: string): Promise<Response | undefined> {
  let answered: Promise<Response> | undefined
  const request = new Request(url)
  listeners.fetch?.({ request, respondWith: (value: Promise<Response>) => { answered = value } })
  return answered ? await answered : undefined
}

const IMAGE = 'https://travel.example/api/media/9/display'

function cachedImage(ageMs: number, extra: Record<string, string> = {}) {
  return new Response('old-bytes', {
    status: 200,
    headers: { Date: new Date(Date.now() - ageMs).toUTCString(), ...extra },
  })
}

describe('Service Worker 图片缓存', () => {
  beforeEach(() => vi.clearAllMocks())

  it('新鲜期内直接用缓存，不打扰服务端', async () => {
    const fetchImpl = vi.fn()
    const { listeners, cacheStorage } = await loadWorker(fetchImpl as unknown as typeof fetch)
    const cache = await cacheStorage.open('tj-media-v1')
    await cache!.put(IMAGE, cachedImage(5_000))

    const response = await handle(listeners, IMAGE)

    expect(await response!.text()).toBe('old-bytes')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('撤回发布后再访问，不再返回缓存里那一份，并且把它删掉', async () => {
    // 服务端现在认为这张图不可公开访问
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 403 }))
    const { listeners, cacheStorage } = await loadWorker(fetchImpl as unknown as typeof fetch)
    const cache = await cacheStorage.open('tj-media-v1')
    // 缓存已经过了新鲜期，必须回服务端确认
    await cache!.put(IMAGE, cachedImage(120_000))

    const response = await handle(listeners, IMAGE)

    expect(response!.status).toBe(403)
    // 关键：之后连离线都拿不到它了
    expect(await cache!.match(IMAGE)).toBeUndefined()
  })

  it('图片被删除后同样清掉本地那一份', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 404 }))
    const { listeners, cacheStorage } = await loadWorker(fetchImpl as unknown as typeof fetch)
    const cache = await cacheStorage.open('tj-media-v1')
    await cache!.put(IMAGE, cachedImage(120_000))

    await handle(listeners, IMAGE)

    expect(await cache!.match(IMAGE)).toBeUndefined()
  })

  it('内容没变时用 304 复用缓存，不重新下载', async () => {
    // Response 构造器不允许 304（规范里它是无 body 状态），而 SW 这条分支只读 status
    const notModified = { status: 304, headers: new Headers() } as unknown as Response
    const fetchImpl = vi.fn().mockResolvedValue(notModified)
    const { listeners, cacheStorage } = await loadWorker(fetchImpl as unknown as typeof fetch)
    const cache = await cacheStorage.open('tj-media-v1')
    await cache!.put(IMAGE, cachedImage(120_000, { ETag: '"abc"' }))

    const response = await handle(listeners, IMAGE)

    expect(await response!.text()).toBe('old-bytes')
    // 带上 If-None-Match 才可能换到 304
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ headers: { 'If-None-Match': '"abc"' } })
  })

  it('断网时仍然给缓存，旅途中还能翻看已经下载过的照片', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'))
    const { listeners, cacheStorage } = await loadWorker(fetchImpl as unknown as typeof fetch)
    const cache = await cacheStorage.open('tj-media-v1')
    await cache!.put(IMAGE, cachedImage(600_000))

    const response = await handle(listeners, IMAGE)

    expect(await response!.text()).toBe('old-bytes')
  })

  it('服务端说 no-store 就不留在本地', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('draft-bytes', {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    }))
    const { listeners, cacheStorage } = await loadWorker(fetchImpl as unknown as typeof fetch)
    const cache = await cacheStorage.open('tj-media-v1')

    const response = await handle(listeners, IMAGE)

    expect(await response!.text()).toBe('draft-bytes')
    expect(await cache!.match(IMAGE)).toBeUndefined()
  })

  it('原图和预览令牌图片完全不进缓存链路', async () => {
    const fetchImpl = vi.fn()
    const { listeners } = await loadWorker(fetchImpl as unknown as typeof fetch)

    // 不调用 respondWith 就意味着交回浏览器默认处理，SW 完全不参与
    expect(await handle(listeners, 'https://travel.example/api/media/9/original')).toBeUndefined()
    expect(await handle(listeners, IMAGE + '?previewToken=abc')).toBeUndefined()
  })
})
