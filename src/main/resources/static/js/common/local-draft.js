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
  const DB_NAME = 'travel-journal', STORE = 'drafts', VERSION = 1;
  const POINTER_KEY = 'travel-journal.last-draft';
  const FALLBACK_PREFIX = 'travel-journal.blocks-draft.';
  let dbPromise = null;
  let usable = typeof indexedDB !== 'undefined';

  function open() {
    if (!usable) return Promise.reject(new Error('IndexedDB 不可用'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => { usable = false; dbPromise = null; throw error; });
    return dbPromise;
  }

  function run(mode, work) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
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

  window.LocalDraft = { put, get, remove, pointer };
})();
