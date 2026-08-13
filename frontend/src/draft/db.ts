import {
  DB_NAME,
  DB_VERSION,
  DRAFT_STORE,
  MOMENT_INDEX,
  MOMENT_STORE,
  PHOTO_INDEX,
  PHOTO_STORE,
} from './schema'

/*
 * IndexedDB 连接与事务。
 *
 * 正文放 IndexedDB 而不是 localStorage：localStorage 的读写是同步的，一篇长日记
 * 每敲一个键就 JSON.stringify 一次再同步落盘，在手机上会直接卡住输入。
 *
 * IndexedDB 在无痕模式等场景下可能不可用，那时整体降级回 localStorage——
 * 慢一点也比丢内容强。
 */

let dbPromise: Promise<IDBDatabase> | null = null
let usable = typeof indexedDB !== 'undefined'

/**
 * 建表。
 *
 * 每个分支都先判断存在与否：升级到 v3 的老用户身上 drafts 和 photos 已经建好了，
 * 无条件 createObjectStore 会直接抛错，整个库打不开。
 */
function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE)
  /*
   * v2 起照片本身也进来。IndexedDB 能直接存 Blob，所以断网时拍的照片不必先转
   * base64（那会让内存占用翻好几倍，手机上很容易直接崩掉）。
   */
  if (!db.objectStoreNames.contains(PHOTO_STORE)) {
    const store = db.createObjectStore(PHOTO_STORE, { keyPath: 'key' })
    store.createIndex(PHOTO_INDEX, PHOTO_INDEX)
  }
  // v3：随手记的文字和照片作为一个可重放命令保存。clientId 同时是服务端幂等键。
  if (!db.objectStoreNames.contains(MOMENT_STORE)) {
    const store = db.createObjectStore(MOMENT_STORE, { keyPath: 'clientId' })
    store.createIndex(MOMENT_INDEX, MOMENT_INDEX)
  }
}

export function open(): Promise<IDBDatabase> {
  if (!usable) return Promise.reject(new Error('IndexedDB 不可用'))
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    let abandoned = false
    request.onupgradeneeded = () => upgrade(request.result)
    request.onsuccess = () => {
      if (abandoned) {
        request.result.close()
        return
      }
      // 别的标签页要升级版本时让路，否则那边会一直卡在 blocked
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      abandoned = true
      const error = new Error('另一个旧页面正在占用本地存储，请关闭后重试')
      error.name = 'BlockedError'
      reject(error)
    }
  }).catch((error: Error) => {
    /*
     * 被别的页面挡住是暂时的，下次还能成；其余错误（无痕模式、配额、损坏）
     * 说明这台机器上 IndexedDB 就是用不了，标记为不可用，后续直接走降级路径，
     * 不要每次保存都重试一遍再失败。
     */
    if (error?.name !== 'BlockedError') usable = false
    dbPromise = null
    throw error
  })
  return dbPromise
}

/**
 * 在某个 store 上跑一次操作。
 *
 * 等的是 transaction complete 而不是 request success：request 成功只表示操作
 * 已排入事务，只有事务提交完成才能保证照片 Blob 和离线命令确实落盘。随后再清空
 * 编辑器才不会丢数据。
 */
export function runOn<T>(
  store: string,
  mode: IDBTransactionMode,
  work: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const request = work(tx.objectStore(store))
        let result: T
        request.onsuccess = () => {
          result = request.result
        }
        request.onerror = () => reject(request.error)
        tx.oncomplete = () => resolve(result)
        tx.onerror = () => reject(tx.error ?? request.error)
        tx.onabort = () => reject(tx.error ?? new Error('本地存储事务已中止'))
      }),
  )
}

/** 草稿 store 的快捷方式，调用最频繁。 */
export function run<T>(
  mode: IDBTransactionMode,
  work: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return runOn(DRAFT_STORE, mode, work)
}

/** 仅供测试重置连接状态。 */
export function resetForTest(): void {
  dbPromise = null
  usable = typeof indexedDB !== 'undefined'
}
