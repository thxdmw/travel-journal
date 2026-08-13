import { describe, expect, it } from 'vitest'
import { darker, hexRgb, rgba } from '@/theme/color'

describe('hexRgb', () => {
  it('带不带 # 都能解析', () => {
    expect(hexRgb('#264A3D')).toEqual([38, 74, 61])
    expect(hexRgb('264A3D')).toEqual([38, 74, 61])
  })

  it('大小写都认', () => {
    expect(hexRgb('#ff8800')).toEqual(hexRgb('#FF8800'))
  })

  it('非六位、非法字符、空值一律返回 null', () => {
    // 主题配置来自数据库，坏值必须走 null 分支而不是算出一个乱七八糟的颜色
    expect(hexRgb('#FFF')).toBeNull()
    expect(hexRgb('#GGGGGG')).toBeNull()
    expect(hexRgb('')).toBeNull()
    expect(hexRgb(null)).toBeNull()
    expect(hexRgb(undefined)).toBeNull()
    expect(hexRgb(123)).toBeNull()
  })
})

describe('rgba', () => {
  it('拼出带透明度的颜色', () => {
    expect(rgba('#264A3D', 0.3)).toBe('rgba(38,74,61,0.3)')
  })

  it('解析不出来时返回 null，让调用方跳过而不是写个坏值', () => {
    expect(rgba('nope', 0.3)).toBeNull()
  })
})

describe('darker', () => {
  it('按比例调暗并补足两位十六进制', () => {
    expect(darker('#FFFFFF', 0.5)).toBe('#808080')
    expect(darker('#101010', 0.5)).toBe('#080808')
  })

  it('默认调暗 16%', () => {
    // 0x64 = 100，100 × 0.84 = 84 = 0x54
    expect(darker('#646464')).toBe('#545454')
  })

  it('不会算出负值', () => {
    expect(darker('#000000', 2)).toBe('#000000')
  })

  it('解析失败时原样返回，调用方拿到的仍是能用的值', () => {
    expect(darker('var(--x)')).toBe('var(--x)')
  })
})
