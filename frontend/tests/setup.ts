/*
 * jsdom 没有 IndexedDB。草稿仓库的用例需要一个真正能跑事务、索引和 Blob 存取的
 * 实现——用 mock 替身测不出「事务提交后数据才算落盘」这类正是会出错的地方。
 */
import 'fake-indexeddb/auto'

/*
 * jsdom 没有 ResizeObserver。预览缩放靠它跟随图片加载后的高度变化，缺了它组件会直接抛错。
 * 这里给一个不触发回调的替身：观察行为本身由浏览器保证，单测要验的是「算出多少缩放比」，
 * 那部分是纯函数，另有用例覆盖。
 */
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() { /* 替身不回调 */ }
    unobserve() { /* 同上 */ }
    disconnect() { /* 同上 */ }
  } as unknown as typeof ResizeObserver
}
