/*
 * 本机草稿仓库。
 *
 * 正文放 IndexedDB 而不是 localStorage：localStorage 的读写是同步的，一篇长日记
 * 每敲一个键就 JSON.stringify 一次再同步落盘，在手机上会直接卡住输入。
 * localStorage 这里只留一个「最近编辑的是哪篇」的指针，几十字节。
 *
 * IndexedDB 在无痕模式等场景下可能不可用，那时整体降级回 localStorage——
 * 慢一点也比丢内容强。
 */
(function () {
  'use strict';
  const DB_NAME = 'travel-journal', STORE = 'drafts', PHOTO_STORE = 'photos';
  const MOMENT_STORE = 'pending-moments', VERSION = 3;
  const POINTER_KEY = 'travel-journal.last-draft';
  const FALLBACK_PREFIX = 'travel-journal.blocks-draft.';
  let dbPromise = null;
  let usable = typeof indexedDB !== 'undefined';

  function open() {
    if (!usable) return Promise.reject(new Error('IndexedDB 不可用'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, VERSION);
      let abandoned = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        // v2 起照片本身也进来。IndexedDB 能直接存 Blob，所以断网时拍的照片
        // 不必先转 base64（那会让内存占用翻好几倍，手机上很容易直接崩掉）。
        if (!db.objectStoreNames.contains(PHOTO_STORE)) {
          const store = db.createObjectStore(PHOTO_STORE, { keyPath: 'key' });
          store.createIndex('journalId', 'journalId');
        }
        // v3：随手记的文字和照片作为一个可重放命令保存。clientId 同时是服务端幂等键。
        if (!db.objectStoreNames.contains(MOMENT_STORE)) {
          const store = db.createObjectStore(MOMENT_STORE, { keyPath: 'clientId' });
          store.createIndex('tripId', 'tripId');
        }
      };
      request.onsuccess = () => {
        if (abandoned) { request.result.close(); return; }
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        abandoned = true;
        const error = new Error('另一个旧页面正在占用本地存储，请关闭后重试');
        error.name = 'BlockedError';
        reject(error);
      };
    }).catch(error => {
      if (error?.name !== 'BlockedError') usable = false;
      dbPromise = null;
      throw error;
    });
    return dbPromise;
  }

  function run(mode, work) {
    return runOn(STORE, mode, work);
  }

  function runOn(store, mode, work) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = work(tx.objectStore(store));
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
      // IndexedDB 的 request 成功只表示操作已排入事务；等 transaction complete
      // 才能保证照片 Blob 和离线命令确实落盘，随后再清空编辑器才不会丢数据。
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || request.error);
      tx.onabort = () => reject(tx.error || new Error('本地存储事务已中止'));
    }));
  }

  const fallbackKey = id => FALLBACK_PREFIX + id;

  async function put(id, payload) {
    if (id == null) return;
    const record = { savedAt: Date.now(), form: payload };
    try {
      await run('readwrite', store => store.put(record, String(id)));
    } catch (_) {
      try { localStorage.setItem(fallbackKey(id), JSON.stringify(record)); } catch (_ignored) {}
    }
    try { localStorage.setItem(POINTER_KEY, JSON.stringify({ journalId: id, lastDraftAt: record.savedAt })); } catch (_) {}
  }

  async function get(id) {
    if (id == null) return null;
    try {
      const record = await run('readonly', store => store.get(String(id)));
      if (record) return record;
    } catch (_) {}
    try {
      const raw = localStorage.getItem(fallbackKey(id));
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  async function remove(id) {
    if (id == null) return;
    try { await run('readwrite', store => store.delete(String(id))); } catch (_) {}
    try {
      localStorage.removeItem(fallbackKey(id));
      const pointer = JSON.parse(localStorage.getItem(POINTER_KEY) || 'null');
      if (pointer && Number(pointer.journalId) === Number(id)) localStorage.removeItem(POINTER_KEY);
    } catch (_) {}
  }

  /** 最近一次编辑的日记指针，供「继续上次没写完的」这类入口使用。 */
  function pointer() {
    try { return JSON.parse(localStorage.getItem(POINTER_KEY) || 'null'); } catch (_) { return null; }
  }

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
  async function queuePhoto(journalId, key, file, name) {
    if (journalId == null || !key || !file) return false;
    try {
      await runOn(PHOTO_STORE, 'readwrite', store => store.put({
        key: key, journalId: Number(journalId), name: name || file.name || 'photo.jpg',
        type: file.type || 'image/jpeg', blob: file, queuedAt: Date.now()
      }));
      return true;
    } catch (_) {
      // 存不下（配额满、无痕模式）不该拦住上传本身，只是失去了断电重开后的恢复能力
      return false;
    }
  }

  /** 某篇日记还有哪些照片没传上去，按入队顺序返回。 */
  async function pendingPhotos(journalId) {
    if (journalId == null) return [];
    try {
      const all = await runOn(PHOTO_STORE, 'readonly', store => store.index('journalId')
        .getAll(IDBKeyRange.only(Number(journalId))));
      return (all || []).sort((a, b) => a.queuedAt - b.queuedAt);
    } catch (_) { return []; }
  }

  /** 传完了或者作者放弃了，就把这一张从队列里去掉。 */
  async function dropPhoto(key) {
    if (!key) return;
    try { await runOn(PHOTO_STORE, 'readwrite', store => store.delete(key)); } catch (_) {}
  }

  /** 离线随手记整体入队；照片直接保存 Blob，不转 base64。 */
  async function queueMoment(moment) {
    if (!moment?.clientId || moment.tripId == null) return false;
    const now = Date.now();
    const record = Object.assign({ state: 'pending', retryCount: 0, createdAt: now }, moment, { updatedAt: now });
    try {
      await runOn(MOMENT_STORE, 'readwrite', store => store.put(record));
      return true;
    } catch (_) { return false; }
  }

  async function pendingMoments(tripId) {
    try {
      const records = tripId == null
        ? await runOn(MOMENT_STORE, 'readonly', store => store.getAll())
        : await runOn(MOMENT_STORE, 'readonly', store => store.index('tripId').getAll(IDBKeyRange.only(Number(tripId))));
      return (records || []).sort((a, b) => a.createdAt - b.createdAt);
    } catch (_) { return []; }
  }

  async function pendingMoment(clientId) {
    if (!clientId) return null;
    try { return await runOn(MOMENT_STORE, 'readonly', store => store.get(clientId)) || null; }
    catch (_) { return null; }
  }

  async function updatePendingMoment(clientId, patch) {
    const current = await pendingMoment(clientId);
    if (!current) return null;
    const updated = Object.assign({}, current, patch || {}, { clientId: clientId, updatedAt: Date.now() });
    try {
      await runOn(MOMENT_STORE, 'readwrite', store => store.put(updated));
      return updated;
    } catch (_) { return null; }
  }

  async function dropPendingMoment(clientId) {
    if (!clientId) return;
    try { await runOn(MOMENT_STORE, 'readwrite', store => store.delete(clientId)); } catch (_) {}
  }

  window.LocalDraft = { put, get, remove, pointer, queuePhoto, pendingPhotos, dropPhoto,
    queueMoment, pendingMoments, pendingMoment, updatePendingMoment, dropPendingMoment };
})();
