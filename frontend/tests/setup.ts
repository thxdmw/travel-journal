/*
 * jsdom 没有 IndexedDB。草稿仓库的用例需要一个真正能跑事务、索引和 Blob 存取的
 * 实现——用 mock 替身测不出「事务提交后数据才算落盘」这类正是会出错的地方。
 */
import 'fake-indexeddb/auto'
