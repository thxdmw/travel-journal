import { describe, expect, it } from 'vitest'
import { gcj02ToWgs84, outOfChina, wgs84ToGcj02 } from '@/map/coordinates'

/** 两点间的近似米数。纬度一度约 111 km，经度按纬度收缩。 */
function metersBetween(a: [number, number], b: [number, number]): number {
  const dLat = (a[0] - b[0]) * 111_320
  const dLng = (a[1] - b[1]) * 111_320 * Math.cos((a[0] * Math.PI) / 180)
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

describe('境内外判定', () => {
  it('中国主要城市判为境内', () => {
    const cities: [number, number][] = [
      [39.9042, 116.4074], // 北京
      [31.2304, 121.4737], // 上海
      [30.5728, 104.0668], // 成都
      [22.3193, 114.1694], // 香港
    ]
    for (const [lat, lng] of cities) expect(outOfChina(lat, lng), `${lat},${lng}`).toBe(false)
  })

  it('境外城市判为境外', () => {
    const cities: [number, number][] = [
      [35.6762, 139.6503], // 东京
      [48.8566, 2.3522], // 巴黎
      [-33.8688, 151.2093], // 悉尼
      [40.7128, -74.006], // 纽约
    ]
    for (const [lat, lng] of cities) expect(outOfChina(lat, lng), `${lat},${lng}`).toBe(true)
  })
})

describe('WGS84 转 GCJ-02', () => {
  it('境内会产生偏移，量级在几百米', () => {
    // 加密偏移通常是 300–700 米，太小说明没转，太大说明公式抄错了
    const wgs: [number, number] = [39.9042, 116.4074]
    const gcj = wgs84ToGcj02(...wgs)
    const shift = metersBetween(wgs, gcj)
    expect(shift).toBeGreaterThan(100)
    expect(shift).toBeLessThan(1000)
  })

  it('境内各地都会产生几百米量级的偏移', () => {
    /*
     * 这里刻意不断言偏移方向。GCJ-02 的偏移方向随位置变化——北京纬度增大，
     * 上海反而减小——没有可靠依据就不写死方向，那样只会得到一条看起来严格、
     * 实际只是把当前实现抄了一遍的断言。量级和往返精度才是真正的不变量。
     */
    const points: [number, number][] = [
      [39.9042, 116.4074], // 北京
      [31.2304, 121.4737], // 上海
      [23.1291, 113.2644], // 广州
      [43.8256, 87.6168], // 乌鲁木齐
    ]
    for (const point of points) {
      const shift = metersBetween(point, wgs84ToGcj02(...point))
      expect(shift, String(point)).toBeGreaterThan(100)
      expect(shift, String(point)).toBeLessThan(1000)
    }
  })

  it('同一个点每次转换结果相同', () => {
    // 纯函数，没有随机性也没有时间依赖
    const first = wgs84ToGcj02(39.9042, 116.4074)
    const second = wgs84ToGcj02(39.9042, 116.4074)
    expect(first).toEqual(second)
  })

  it('境外原样返回，一个字节都不动', () => {
    expect(wgs84ToGcj02(35.6762, 139.6503)).toEqual([35.6762, 139.6503])
    expect(wgs84ToGcj02(48.8566, 2.3522)).toEqual([48.8566, 2.3522])
  })
})

describe('往返', () => {
  it('境内往返回到原点附近，误差在米级', () => {
    /*
     * GCJ-02 加密不可逆，用的是一次反向偏移近似。米级误差对展示足够，
     * 但这个量级必须守住——退化到几十米就说明反向公式写错了。
     */
    const points: [number, number][] = [
      [39.9042, 116.4074],
      [31.2304, 121.4737],
      [22.3193, 114.1694],
      [43.8256, 87.6168], // 乌鲁木齐，靠近西部边界
    ]
    for (const wgs of points) {
      const back = gcj02ToWgs84(...wgs84ToGcj02(...wgs))
      expect(metersBetween(wgs, back), String(wgs)).toBeLessThan(5)
    }
  })

  it('境外往返完全无损', () => {
    const wgs: [number, number] = [35.6762, 139.6503]
    expect(gcj02ToWgs84(...wgs84ToGcj02(...wgs))).toEqual(wgs)
  })
})
