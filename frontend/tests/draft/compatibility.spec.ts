import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { resetForTest } from '@/draft/db'
import { get as getDraft, pointer, put as putDraft, remove as removeDraft } from '@/draft/drafts'
import { pendingPhotos, queuePhoto } from '@/draft/photos'
import { pendingMoment, pendingMoments, queueMoment } from '@/draft/moments'
import {
  DB_NAME,
  DB_VERSION,
  DRAFT_STORE,
  MOMENT_INDEX,
  MOMENT_STORE,
  PHOTO_INDEX,
  PHOTO_STORE,
  POINTER_KEY,
} from '@/draft/schema'

/*
 * 与迁移前实现的数据兼容性。
 *
 * 这是整个迁移里唯一一个「写错了用户会永久丢东西」的模块——库名、store 名、
 * keyPath、索引名、版本号里任何一个字符对不上，用户机器上已有的草稿就在下一次
 * 打开时凭空消失，而且没有任何提示。
 *
 * 所以这里不比对 API 形状，而是直接让迁移前的实现往库里写，再用新实现读：
 * 这才是升级那一刻真实发生的事。
 */

interface LegacyApi {
  put(id: unknown, payload: unknown): Promise<void>
  get(id: unknown): Promise<{ savedAt: number; form: unknown } | null>
  remove(id: unknown): Promise<void>
  pointer(): { journalId: number; lastDraftAt: number } | null
  queuePhoto(journalId: unknown, key: string, file: Blob, name?: string): Promise<boolean>
  pendingPhotos(journalId: unknown): Promise<{ key: string; name: string; blob: Blob }[]>
  queueMoment(moment: unknown): Promise<boolean>
  pendingMoments(tripId?: unknown): Promise<{ clientId: string }[]>
}

/** 每个用例都在全新的库上跑，避免互相看到对方写的数据。 */
function freshDatabase(): void {
  globalThis.indexedDB = new IDBFactory()
  resetForTest()
}

function loadLegacy(): LegacyApi {
  const source = readFileSync(resolve('tests/fixtures/legacy-local-draft.js'), 'utf8')
  const host: { LocalDraft?: LegacyApi } = {}
  new Function('window', 'indexedDB', 'IDBKeyRange', 'localStorage', source)(
    host,
    indexedDB,
    IDBKeyRange,
    localStorage,
  )
  if (!host.LocalDraft) throw new Error('夹具没有建立 LocalDraft')
  return host.LocalDraft
}

beforeEach(() => {
  localStorage.clear()
  freshDatabase()
})

afterEach(() => {
  localStorage.clear()
})

describe('存储契约', () => {
  it('库名、版本、store 与索引都不能变', async () => {
    // 这些常量对应用户机器上已经存在的数据，改一个字符就是一次静默的数据丢失
    expect(DB_NAME).toBe('travel-journal')
    expect(DB_VERSION).toBe(3)
    expect(DRAFT_STORE).toBe('drafts')
    expect(PHOTO_STORE).toBe('photos')
    expect(MOMENT_STORE).toBe('pending-moments')
    expect(PHOTO_INDEX).toBe('journalId')
    expect(MOMENT_INDEX).toBe('tripId')
    expect(POINTER_KEY).toBe('travel-journal.last-draft')
  })

  it('建出来的库结构与迁移前完全一致', async () => {
    await putDraft(1, { title: 'x' })
    const db = await new Promise<IDBDatabase>((done, fail) => {
      const request = indexedDB.open(DB_NAME)
      request.onsuccess = () => done(request.result)
      request.onerror = () => fail(request.error)
    })

    expect(db.version).toBe(3)
    expect([...db.objectStoreNames].sort()).toEqual(['drafts', 'pending-moments', 'photos'])

    const tx = db.transaction(['drafts', 'photos', 'pending-moments'], 'readonly')
    // drafts 没有 keyPath，键由调用方给
    expect(tx.objectStore('drafts').keyPath).toBeNull()
    expect(tx.objectStore('photos').keyPath).toBe('key')
    expect([...tx.objectStore('photos').indexNames]).toEqual(['journalId'])
    expect(tx.objectStore('pending-moments').keyPath).toBe('clientId')
    expect([...tx.objectStore('pending-moments').indexNames]).toEqual(['tripId'])
    db.close()
  })
})

describe('旧实现写入的数据，新实现读得出来', () => {
  it('正文草稿', async () => {
    const legacy = loadLegacy()
    await legacy.put(42, { title: '青城山', blocks: [{ type: 'paragraph' }] })

    const record = await getDraft(42)
    expect(record).not.toBeNull()
    expect(record?.form).toEqual({ title: '青城山', blocks: [{ type: 'paragraph' }] })
    expect(typeof record?.savedAt).toBe('number')
  })

  it('草稿指针', async () => {
    const legacy = loadLegacy()
    await legacy.put(42, { title: 'x' })
    expect(pointer()?.journalId).toBe(42)
  })

  it('待上传照片，连 Blob 内容一起', async () => {
    const legacy = loadLegacy()
    const blob = new Blob(['原始照片字节'], { type: 'image/jpeg' })
    await legacy.queuePhoto(42, 'k1', blob, 'DSC001.jpg')

    const photos = await pendingPhotos(42)
    expect(photos).toHaveLength(1)
    expect(photos[0]?.name).toBe('DSC001.jpg')
    expect(photos[0]?.type).toBe('image/jpeg')
    expect(photos[0]?.queuedAt).toBeTypeOf('number')

    /*
     * 这里只能验到元数据。
     *
     * jsdom 的 Blob 不被 Node 的结构化克隆支持，fake-indexeddb 存回来的是一个空
     * 对象——不是实现的问题，是测试环境的边界。所以「照片内容原样往返、没有被转成
     * base64」这条由真实浏览器里的 scripts/verify-legacy-bundles.mjs 覆盖，
     * 不要在这里加断言假装验过了。
     */
    expect(blob.size).toBeGreaterThan(0)
  })

  it('离线随手记', async () => {
    const legacy = loadLegacy()
    await legacy.queueMoment({ clientId: 'c-1', tripId: 7, content: '地铁上写的' })

    const moment = await pendingMoment('c-1')
    expect(moment?.content).toBe('地铁上写的')
    expect(moment?.tripId).toBe(7)
    expect(moment?.state).toBe('pending')
  })
})

describe('新实现写入的数据，旧实现也读得出来', () => {
  /*
   * 反向也要成立：升级后用户可能因为缓存拿到旧的 HTML 再刷回来，或者手动回滚
   * 了这次发布。两个方向都通，回滚才是安全的。
   */
  it('正文草稿', async () => {
    await putDraft(42, { title: '往回读' })
    const legacy = loadLegacy()
    expect((await legacy.get(42))?.form).toEqual({ title: '往回读' })
  })

  it('待上传照片', async () => {
    await queuePhoto(42, 'k1', new Blob(['x'], { type: 'image/png' }), 'a.png')
    const legacy = loadLegacy()
    const photos = await legacy.pendingPhotos(42)
    expect(photos).toHaveLength(1)
    expect(photos[0]?.name).toBe('a.png')
  })

  it('离线随手记', async () => {
    await queueMoment({ clientId: 'c-9', tripId: 3 })
    const legacy = loadLegacy()
    expect((await legacy.pendingMoments(3)).map(m => m.clientId)).toEqual(['c-9'])
  })
})

describe('两份实现的行为一致', () => {
  it('删除草稿时都会清掉指向它的指针', async () => {
    await putDraft(42, { title: 'x' })
    expect(pointer()).not.toBeNull()
    await removeDraft(42)
    expect(pointer()).toBeNull()
  })

  it('删除另一篇时不动指针', async () => {
    // 指针指着 42，删 43 不该把「继续编辑」入口一起抹掉
    await putDraft(42, { title: 'x' })
    await removeDraft(43)
    expect(pointer()?.journalId).toBe(42)
  })

  it('照片按入队顺序返回', async () => {
    await queuePhoto(1, 'a', new Blob(['1']))
    await new Promise(done => setTimeout(done, 2))
    await queuePhoto(1, 'b', new Blob(['2']))
    expect((await pendingPhotos(1)).map(p => p.key)).toEqual(['a', 'b'])
  })

  it('照片按日记隔离', async () => {
    await queuePhoto(1, 'a', new Blob(['1']))
    await queuePhoto(2, 'b', new Blob(['2']))
    expect((await pendingPhotos(1)).map(p => p.key)).toEqual(['a'])
    expect((await pendingPhotos(2)).map(p => p.key)).toEqual(['b'])
  })

  it('随手记按旅行隔离，不传 tripId 时给全部', async () => {
    await queueMoment({ clientId: 'a', tripId: 1 })
    await queueMoment({ clientId: 'b', tripId: 2 })
    expect((await pendingMoments(1)).map(m => m.clientId)).toEqual(['a'])
    expect((await pendingMoments()).map(m => m.clientId).sort()).toEqual(['a', 'b'])
  })

  it('同一个 clientId 重复入队只留一条', async () => {
    // clientId 是服务端的幂等键，本地也必须是主键，否则补传会重复提交
    await queueMoment({ clientId: 'same', tripId: 1, content: '第一版' })
    await queueMoment({ clientId: 'same', tripId: 1, content: '第二版' })
    const all = await pendingMoments(1)
    expect(all).toHaveLength(1)
    expect(all[0]?.content).toBe('第二版')
  })
})
