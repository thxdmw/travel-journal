/** 本机草稿仓库里的记录形状。字段名直接对应用户机器上已有的数据，不要改名。 */

/** 一篇正文草稿。form 是编辑器的整份表单快照，结构由编辑器决定。 */
export interface DraftRecord {
  savedAt: number
  form: unknown
}

/** 「最近编辑的是哪篇」。供「继续上次没写完的」这类入口使用。 */
export interface DraftPointer {
  journalId: number | string
  lastDraftAt: number
}

/** 待上传照片。blob 是原始文件，不转 base64。 */
export interface PendingPhoto {
  key: string
  journalId: number
  name: string
  type: string
  blob: Blob
  queuedAt: number
}

export type PendingMomentState = 'pending' | 'uploading' | 'failed'

/**
 * 离线随手记。整条当作一个可重放命令保存。
 *
 * clientId 既是本地主键也是服务端的幂等键——补传时重复提交同一条不会在服务端
 * 多出一份。
 */
export interface PendingMoment {
  clientId: string
  tripId: number
  state: PendingMomentState
  retryCount: number
  createdAt: number
  updatedAt: number
  [key: string]: unknown
}

/** 入队时调用方给的字段。state / retryCount / 时间戳由仓库补齐。 */
export interface PendingMomentInput {
  clientId: string
  tripId: number
  [key: string]: unknown
}
