/*
 * 渲染层的安全边界。
 *
 * 正文是拼字符串出来的 HTML，所以每一个来自 content_json 的值都必须过 esc()。
 * 这里是唯一的转义入口——绕过它往模板里塞原始值，就等于开了个 XSS 口子。
 */

/** HTML 文本转义。null / undefined 一律当空串，不输出字面的 "null"。 */
export function esc(value: unknown): string {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 转义后把换行变成 <br>。多行文本用它，单行字段用 esc。 */
export function lines(value: unknown): string {
  return esc(value).replace(/\n/g, '<br>')
}

/**
 * 链接白名单。
 *
 * 只放行 http 和 https，其余（javascript:、data:、vbscript: 等）一律退成 '#'。
 * 链接卡片的 url 来自作者输入，这一层不能省。
 */
export function safeLink(value: unknown): string {
  const text = String(value ?? '')
  return /^https?:\/\//i.test(text) ? text : '#'
}

/** 2026-08-10 → 8月10日。开场卡上写「8月10日」比写完整日期更像日记。 */
export function formatDay(value: unknown): string {
  return String(value ?? '').replace(
    /^(\d{4})-(\d{2})-(\d{2})$/,
    (_match, _year, month: string, day: string) => Number(month) + '月' + Number(day) + '日',
  )
}

/*
 * 下面几个读取器让渲染代码能安全地从 BlockData 里取值。
 *
 * 原来的 JS 直接写 item.label，遇到数组里混进 null 会抛 TypeError，整篇日记
 * 渲染不出来。content_json 来自数据库，被手工改坏过一次就永远打不开——渲染层
 * 对坏数据健壮一点是值得的，正常数据的输出完全不变。
 */

export function str(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

export function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function rec(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * 取数值。语义与原实现的 `Number(x) || fallback` 完全一致：
 * NaN 退回 fallback，0 也退回 fallback——调用点正是靠这个把「没填」和「填了 0」
 * 当同一件事处理的（比如 heading 的 level）。
 */
export function num(value: unknown, fallback = 0): number {
  return Number(value) || fallback
}

/** 夹在区间内的整数，越界的配置不会把布局撑坏。 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
