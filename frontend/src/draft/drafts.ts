import { run } from './db'
import { POINTER_KEY, fallbackKey } from './schema'
import type { DraftPointer, DraftRecord } from '@/types/draft'

/*
 * 正文草稿的读写。
 *
 * 每个写入路径都有 IndexedDB → localStorage 的降级，而且降级失败也不抛错：
 * 自动保存是在用户打字的间隙跑的，为了存草稿把编辑器搞崩是最坏的结果。
 */

function readPointer(): DraftPointer | null {
  try {
    return JSON.parse(localStorage.getItem(POINTER_KEY) ?? 'null') as DraftPointer | null
  } catch {
    return null
  }
}

export async function put(id: string | number | null | undefined, payload: unknown): Promise<void> {
  if (id == null) return
  const record: DraftRecord = { savedAt: Date.now(), form: payload }
  try {
    await run('readwrite', store => store.put(record, String(id)))
  } catch {
    // IndexedDB 写不进去就退回 localStorage，慢一点也比丢内容强
    try {
      localStorage.setItem(fallbackKey(id), JSON.stringify(record))
    } catch {
      // 两条路都堵死（配额满、无痕模式）。这一次自动保存就是丢了，
      // 但不能因此打断作者正在进行的输入。
    }
  }
  try {
    localStorage.setItem(POINTER_KEY, JSON.stringify({ journalId: id, lastDraftAt: record.savedAt }))
  } catch {
    // 指针丢了只影响「继续上次没写完的」这个入口，正文本身还在
  }
}

export async function get(id: string | number | null | undefined): Promise<DraftRecord | null> {
  if (id == null) return null
  try {
    const record = await run<DraftRecord | undefined>('readonly', store => store.get(String(id)))
    if (record) return record
  } catch {
    // 落到下面读 localStorage
  }
  try {
    const raw = localStorage.getItem(fallbackKey(id))
    return raw ? (JSON.parse(raw) as DraftRecord) : null
  } catch {
    return null
  }
}

export async function remove(id: string | number | null | undefined): Promise<void> {
  if (id == null) return
  try {
    await run('readwrite', store => store.delete(String(id)))
  } catch {
    // 删不掉也要继续清 localStorage 那一份
  }
  try {
    localStorage.removeItem(fallbackKey(id))
    const current = readPointer()
    // 只有指针确实指着这一篇时才清，否则会把另一篇的「继续编辑」入口一起抹掉
    if (current && Number(current.journalId) === Number(id)) localStorage.removeItem(POINTER_KEY)
  } catch {
    // 清理失败不影响主流程
  }
}

/** 最近一次编辑的日记指针。 */
export function pointer(): DraftPointer | null {
  return readPointer()
}
