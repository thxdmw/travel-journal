import { runOn } from './db'
import { PHOTO_INDEX, PHOTO_STORE } from './schema'
import type { PendingPhoto } from '@/types/draft'

/*
 * 待上传照片队列。
 *
 * 旅行中最需要它的场景是：地铁里没信号 → 拍照 → 继续写 → 浏览器被系统杀掉 →
 * 重新打开 → 照片还在 → 有网了自动传上去。要做到这一点，光把文字存进 IndexedDB
 * 不够，照片本身也得留下来——File 对象活在内存里，标签页一关就没了。
 *
 * 这里直接存 Blob，不转 base64：一张 4MB 的照片转成 base64 是 5.5MB 的字符串，
 * 十几张就能把手机浏览器的内存吃光。IndexedDB 原生支持 Blob，没必要绕这一圈。
 */

export async function queuePhoto(
  journalId: number | string | null | undefined,
  key: string,
  file: File | Blob,
  name?: string,
): Promise<boolean> {
  if (journalId == null || !key || !file) return false
  const record: PendingPhoto = {
    key,
    journalId: Number(journalId),
    name: name || (file as File).name || 'photo.jpg',
    type: file.type || 'image/jpeg',
    blob: file,
    queuedAt: Date.now(),
  }
  try {
    await runOn(PHOTO_STORE, 'readwrite', store => store.put(record))
    return true
  } catch {
    // 存不下（配额满、无痕模式）不该拦住上传本身，只是失去了断电重开后的恢复能力
    return false
  }
}

/** 某篇日记还有哪些照片没传上去，按入队顺序返回。 */
export async function pendingPhotos(journalId: number | string | null | undefined): Promise<PendingPhoto[]> {
  if (journalId == null) return []
  try {
    const all = await runOn<PendingPhoto[]>(PHOTO_STORE, 'readonly', store =>
      store.index(PHOTO_INDEX).getAll(IDBKeyRange.only(Number(journalId))),
    )
    return (all ?? []).sort((a, b) => a.queuedAt - b.queuedAt)
  } catch {
    return []
  }
}

/**
 * 本机临时草稿转正后，把还没传上去的照片改挂到真实日记 id 上。
 *
 * 用 put 覆盖同一条记录而不是新增：keyPath 是 key，key 不变意味着正文里的
 * pendingKey 依然对得上，也不会因为搬家而重复上传一张。
 *
 * @return 实际迁移成功的张数
 */
export async function reassignPhotos(
  fromJournalId: number | string | null | undefined,
  toJournalId: number | string | null | undefined,
): Promise<number> {
  if (fromJournalId == null || toJournalId == null) return 0
  const queued = await pendingPhotos(fromJournalId)
  let moved = 0
  for (const item of queued) {
    try {
      await runOn(PHOTO_STORE, 'readwrite', store => store.put({ ...item, journalId: Number(toJournalId) }))
      moved++
    } catch {
      // 迁不动的那张仍留在旧 id 下，最坏是这次接不上续传，不会丢原图
    }
  }
  return moved
}

/** 传完了或者作者放弃了，就把这一张从队列里去掉。 */
export async function dropPhoto(key: string | null | undefined): Promise<void> {
  if (!key) return
  try {
    await runOn(PHOTO_STORE, 'readwrite', store => store.delete(key))
  } catch {
    // 删不掉最多是下次重开时多传一张，服务端有幂等保护
  }
}
