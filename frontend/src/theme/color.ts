/** 主题色的几个派生计算。纯函数，不碰 DOM。 */

/** 解析六位十六进制色。带不带 # 都行，其余一律当作无效返回 null。 */
export function hexRgb(hex: unknown): [number, number, number] | null {
  const value = String(hex ?? '').replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(value)) return null
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}

/** 转成带透明度的 rgba()。解析不出来时返回 null，让调用方跳过这条变量而不是写个坏值。 */
export function rgba(hex: unknown, alpha: number): string | null {
  const rgb = hexRgb(hex)
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})` : null
}

/** 按比例调暗。解析失败时原样返回，调用方拿到的仍是一个能用的颜色值。 */
export function darker(hex: string, amount = 0.16): string {
  const rgb = hexRgb(hex)
  if (!rgb) return hex
  return (
    '#' +
    rgb
      .map(value =>
        Math.max(0, Math.round(value * (1 - amount)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  )
}
