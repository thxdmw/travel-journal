import type { Decimal, IsoDateTimeString } from './common'

/**
 * 一张图片在某篇日记里的展示信息，对应后端 `MediaService.MediaView`。
 *
 * 三档地址是后端预生成好的：列表用 thumbnail，正文用 medium/display。
 * 原图地址不在这里——需要原图的场景很少，不该让每个列表都顺手把它带出去。
 */
export interface MediaView {
  /** journal_media 关系 id。排序、改说明、删除都用它，不是 media id。 */
  relationId: number | null
  /** 媒体资源 id，跨日记复用同一张图时相同。 */
  id: number
  filename: string
  contentType: string
  width: number | null
  height: number | null
  caption: string | null
  sortOrder: number | null
  thumbnailUrl: string
  mediumUrl: string
  displayUrl: string
  /** 拍摄时间，来自 EXIF。没有 EXIF 的图为 null。 */
  capturedAt: IsoDateTimeString | null
  gpsLatitude: Decimal | null
  gpsLongitude: Decimal | null
}
