import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { resetForTest } from '@/draft/db'
import { get, pointer, put, remove } from '@/draft/drafts'
import { pendingPhotos, queuePhoto } from '@/draft/photos'
import { dropPendingMoment, pendingMoment, queueMoment, updatePendingMoment } from '@/draft/moments'
import { FALLBACK_PREFIX, POINTER_KEY } from '@/draft/schema'

/*
 * 降级与异常路径。
 *
 * 自动保存是在作者打字的间隙跑的：无痕模式、配额满、另一个标签页占着库——
 * 任何一种情况下都不能抛到调用方，否则编辑器会在用户正打字时崩掉。
 */

beforeEach(() => {
  localStorage.clear()
  globalThis.indexedDB = new IDBFactory()
  resetForTest()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

/** 把 IndexedDB 整个拿掉，模拟无痕模式。 */
function disableIndexedDb(): void {
  vi.stubGlobal('indexedDB', undefined)
  resetForTest()
}

describe('IndexedDB 不可用时', () => {
  it('草稿退回 localStorage，内容不丢', async () => {
    disableIndexedDb()
    await put(42, { title: '无痕模式下写的' })

    expect(localStorage.getItem(FALLBACK_PREFIX + '42')).not.toBeNull()
    expect((await get(42))?.form).toEqual({ title: '无痕模式下写的' })
  })

  it('指针照常维护', async () => {
    disableIndexedDb()
    await put(42, { title: 'x' })
    expect(pointer()?.journalId).toBe(42)
  })

  it('删除会把降级副本一起清掉', async () => {
    disableIndexedDb()
    await put(42, { title: 'x' })
    await remove(42)
    expect(localStorage.getItem(FALLBACK_PREFIX + '42')).toBeNull()
    expect(await get(42)).toBeNull()
  })

  it('照片队列退化为不可用，但不抛错', async () => {
    // 照片没法退回 localStorage（几 MB 的二进制），只是失去断电重开的恢复能力
    disableIndexedDb()
    await expect(queuePhoto(1, 'k', new Blob(['x']))).resolves.toBe(false)
    await expect(pendingPhotos(1)).resolves.toEqual([])
  })

  it('随手记队列同样安静退化', async () => {
    disableIndexedDb()
    await expect(queueMoment({ clientId: 'c', tripId: 1 })).resolves.toBe(false)
    await expect(pendingMoment('c')).resolves.toBeNull()
    await expect(updatePendingMoment('c', {})).resolves.toBeNull()
    await expect(dropPendingMoment('c')).resolves.toBeUndefined()
  })
})

describe('localStorage 也写不进去时', () => {
  it('保存失败但不抛错，作者的输入不被打断', async () => {
    disableIndexedDb()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    // 两条路都堵死，这一次自动保存确实丢了，但绝不能让编辑器崩掉
    await expect(put(42, { title: 'x' })).resolves.toBeUndefined()
  })

  it('读取坏掉的降级数据时返回 null 而不是抛错', async () => {
    disableIndexedDb()
    localStorage.setItem(FALLBACK_PREFIX + '42', '{ 这不是 JSON')
    await expect(get(42)).resolves.toBeNull()
  })

  it('指针坏掉时返回 null', () => {
    localStorage.setItem(POINTER_KEY, '不是 JSON')
    expect(pointer()).toBeNull()
  })
})

describe('参数缺失', () => {
  it('id 为空时静默跳过，不写出脏数据', async () => {
    for (const id of [null, undefined]) {
      await expect(put(id, { x: 1 })).resolves.toBeUndefined()
      await expect(get(id)).resolves.toBeNull()
      await expect(remove(id)).resolves.toBeUndefined()
    }
    expect(localStorage.getItem(POINTER_KEY)).toBeNull()
  })

  it('照片缺 key 或文件时不入队', async () => {
    await expect(queuePhoto(1, '', new Blob(['x']))).resolves.toBe(false)
    await expect(queuePhoto(null, 'k', new Blob(['x']))).resolves.toBe(false)
    expect(await pendingPhotos(1)).toEqual([])
  })

  it('随手记缺 clientId 或 tripId 时不入队', async () => {
    // clientId 是幂等键，缺了它补传会重复提交；tripId 决定这条归属哪次旅行
    await expect(queueMoment({ clientId: '', tripId: 1 })).resolves.toBe(false)
    await expect(queueMoment({ clientId: 'c' } as never)).resolves.toBe(false)
    await expect(queueMoment(null)).resolves.toBe(false)
  })
})

describe('随手记的局部更新', () => {
  it('patch 不能改掉 clientId，否则库里会多出一条孤儿记录', async () => {
    await queueMoment({ clientId: 'c-1', tripId: 1, content: '原文' })
    const updated = await updatePendingMoment('c-1', { clientId: '被改了', state: 'failed' } as never)
    expect(updated?.clientId).toBe('c-1')
    expect(await pendingMoment('被改了')).toBeNull()
    expect((await pendingMoment('c-1'))?.state).toBe('failed')
  })

  it('保留未在 patch 里出现的字段', async () => {
    await queueMoment({ clientId: 'c-1', tripId: 1, content: '原文' })
    const updated = await updatePendingMoment('c-1', { retryCount: 2 })
    expect(updated?.content).toBe('原文')
    expect(updated?.retryCount).toBe(2)
  })

  it('更新会推进 updatedAt', async () => {
    await queueMoment({ clientId: 'c-1', tripId: 1 })
    const before = (await pendingMoment('c-1'))?.updatedAt ?? 0
    await new Promise(done => setTimeout(done, 2))
    const updated = await updatePendingMoment('c-1', { retryCount: 1 })
    expect(updated?.updatedAt).toBeGreaterThan(before)
  })

  it('记录不存在时返回 null 而不是凭空建一条', async () => {
    expect(await updatePendingMoment('不存在', { retryCount: 1 })).toBeNull()
    expect(await pendingMoment('不存在')).toBeNull()
  })

  it('重新入队时不让调用方带来的旧 updatedAt 覆盖', async () => {
    /*
     * 补传失败后会把记录整条重新入队，那条记录里带着旧的 updatedAt。
     * 让它覆盖会导致队列的排序和重试判断读到过期时间。
     */
    await queueMoment({ clientId: 'c-1', tripId: 1 })
    const stale = { ...(await pendingMoment('c-1'))!, updatedAt: 0 }
    await new Promise(done => setTimeout(done, 2))
    await queueMoment(stale)
    expect((await pendingMoment('c-1'))?.updatedAt).toBeGreaterThan(0)
  })
})

describe('删除', () => {
  it('删掉的随手记不再出现在队列里', async () => {
    await queueMoment({ clientId: 'c-1', tripId: 1 })
    await dropPendingMoment('c-1')
    expect(await pendingMoment('c-1')).toBeNull()
  })

  it('空 clientId 不做任何事', async () => {
    await queueMoment({ clientId: 'c-1', tripId: 1 })
    await dropPendingMoment('')
    expect(await pendingMoment('c-1')).not.toBeNull()
  })
})
