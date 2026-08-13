/*
 * 本机草稿仓库的存储契约。
 *
 * 这个文件里的每一个字符串和数字都对应用户机器上已经存在的数据。改动其中任何
 * 一个——库名、store 名、keyPath、索引名、版本号、localStorage 的键——都会让
 * 现有草稿在下一次打开时凭空消失，而且没有任何提示。
 *
 * 真要改结构，必须显式写 onupgradeneeded 的迁移分支并验证旧数据读得出来，
 * 不能靠「反正新建一个就好了」。
 */

export const DB_NAME = 'travel-journal'
export const DB_VERSION = 3

/** 正文草稿。没有 keyPath，键是外部传入的日记 id 字符串。 */
export const DRAFT_STORE = 'drafts'

/** v2 起加入：待上传照片，keyPath 是调用方生成的 key。 */
export const PHOTO_STORE = 'photos'
export const PHOTO_INDEX = 'journalId'

/** v3 起加入：离线随手记，keyPath 是 clientId，同时也是服务端的幂等键。 */
export const MOMENT_STORE = 'pending-moments'
export const MOMENT_INDEX = 'tripId'

/** 「最近编辑的是哪篇」的指针。只有几十字节，放 localStorage 就够。 */
export const POINTER_KEY = 'travel-journal.last-draft'

/** IndexedDB 不可用时的降级前缀。 */
export const FALLBACK_PREFIX = 'travel-journal.blocks-draft.'

export const fallbackKey = (id: string | number): string => FALLBACK_PREFIX + id
