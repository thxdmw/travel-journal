/*
 * 国测局加密坐标系（GCJ-02）标准换算。
 *
 * 只在 AMap 适配器内部使用：数据库和整个对外契约永远是 WGS84，渲染前转成
 * GCJ-02，交互事件回调前转回 WGS84。调用方永远不需要关心当前用的是哪套坐标系。
 */

const GCJ_A = 6378245.0
/*
 * 克拉索夫斯基椭球的第一偏心率平方。这是算法定义里的标准写法，位数超过 double
 * 能表示的精度，运行时会被截断成 0.006693421622965943——旧实现也是同一个字面量、
 * 同一个截断结果。改写成截断后的值只会让它和公开资料对不上，不改变任何行为。
 */
// eslint-disable-next-line no-loss-of-precision
const GCJ_EE = 0.00669342162296594323

/** 中国境外不加密，直接原样返回。 */
export function outOfChina(lat: number, lng: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat(x: number, y: number): number {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  ret += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3
  ret += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3
  return ret
}

function transformLng(x: number, y: number): number {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  ret += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3
  ret += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3
  return ret
}

export function wgs84ToGcj02(lat: number, lng: number): [number, number] {
  if (outOfChina(lat, lng)) return [lat, lng]
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = (lat / 180.0) * Math.PI
  let magic = Math.sin(radLat)
  magic = 1 - GCJ_EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / (((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic)) * Math.PI)
  dLng = (dLng * 180.0) / ((GCJ_A / sqrtMagic) * Math.cos(radLat) * Math.PI)
  return [lat + dLat, lng + dLng]
}

/**
 * 反向换算。
 *
 * GCJ-02 加密不可逆，这里用的是标准的一次反向偏移近似：把待还原的点当作
 * WGS84 算一次偏移量，再减回去。米级误差，对展示足够，别拿它做测距。
 */
export function gcj02ToWgs84(lat: number, lng: number): [number, number] {
  if (outOfChina(lat, lng)) return [lat, lng]
  const shifted = wgs84ToGcj02(lat, lng)
  return [lat - (shifted[0] - lat), lng - (shifted[1] - lng)]
}
