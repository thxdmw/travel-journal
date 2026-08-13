import { runOn } from './db'
import { MOMENT_INDEX, MOMENT_STORE } from './schema'
import type { PendingMoment, PendingMomentInput } from '@/types/draft'

/** 离线随手记整体入队；照片直接保存 Blob，不转 base64。 */
export async function queueMoment(moment: PendingMomentInput | null | undefined): Promise<boolean> {
  if (!moment?.clientId || moment.tripId == null) return false
  const now = Date.now()
  /*
   * 顺序有讲究：调用方给的字段盖在默认值之上，但 updatedAt 必须最后写。
   * 补传失败重新入队时，传进来的记录里带着旧的 updatedAt，让它覆盖会导致
   * 队列的排序和重试判断读到过期时间。
   */
  const record = {
    state: 'pending' as const,
    retryCount: 0,
    createdAt: now,
    ...moment,
    updatedAt: now,
  } as PendingMoment
  try {
    await runOn(MOMENT_STORE, 'readwrite', store => store.put(record))
    return true
  } catch {
    return false
  }
}

/** 待补传的随手记，按入队顺序返回。不传 tripId 就是全部。 */
export async function pendingMoments(tripId?: number | string | null): Promise<PendingMoment[]> {
  try {
    const records =
      tripId == null
        ? await runOn<PendingMoment[]>(MOMENT_STORE, 'readonly', store => store.getAll())
        : await runOn<PendingMoment[]>(MOMENT_STORE, 'readonly', store =>
            store.index(MOMENT_INDEX).getAll(IDBKeyRange.only(Number(tripId))),
          )
    return (records ?? []).sort((a, b) => a.createdAt - b.createdAt)
  } catch {
    return []
  }
}

export async function pendingMoment(clientId: string | null | undefined): Promise<PendingMoment | null> {
  if (!clientId) return null
  try {
    return (await runOn<PendingMoment | undefined>(MOMENT_STORE, 'readonly', store => store.get(clientId))) ?? null
  } catch {
    return null
  }
}

/** 局部更新一条。clientId 由本函数保证不被 patch 改掉，否则会在库里多出一条孤儿记录。 */
export async function updatePendingMoment(
  clientId: string,
  patch?: Partial<PendingMoment> | null,
): Promise<PendingMoment | null> {
  const current = await pendingMoment(clientId)
  if (!current) return null
  const updated: PendingMoment = { ...current, ...(patch ?? {}), clientId, updatedAt: Date.now() }
  try {
    await runOn(MOMENT_STORE, 'readwrite', store => store.put(updated))
    return updated
  } catch {
    return null
  }
}

export async function dropPendingMoment(clientId: string | null | undefined): Promise<void> {
  if (!clientId) return
  try {
    await runOn(MOMENT_STORE, 'readwrite', store => store.delete(clientId))
  } catch {
    // 删不掉最多是下次多补传一次，服务端按 clientId 幂等
  }
}
