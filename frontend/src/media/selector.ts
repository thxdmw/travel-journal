/**
 * 正文媒体图片的选择器：单图、图片组、明信片。
 *
 * 这是一条硬边界，不是样式选择。主题贴纸、头像、Logo、Hero、地图图标、UI 图标
 * 一律不在此列——灯箱和图片分组只认这三种容器下的 `<img>`，不管它们在 DOM 里
 * 离得多近。退回宽泛的 `querySelectorAll('img')` 会让读者点开正文照片时翻到
 * 装饰贴纸和站长头像。
 */
export const MEDIA_SELECTOR = '.journal-figure img, .journal-gallery img, .journal-postcard img'

/**
 * 取某张图片所属的一组，供灯箱翻页用。
 *
 * 同一个多图块算一组；正文里零散的单图算作「整篇正文」一组，这样连着写的
 * 几张图也能左右翻，符合读者的预期。
 */
export function groupOf(image: unknown): HTMLImageElement[] {
  if (!(image instanceof HTMLImageElement)) return []
  // 不是正文媒体就返回空数组，调用方据此不开灯箱
  if (!image.matches(MEDIA_SELECTOR)) return []
  const block = image.closest('.journal-gallery')
  const scope = block ?? image.closest('.journal-document')
  if (!scope) return [image]
  return Array.from(scope.querySelectorAll<HTMLImageElement>(MEDIA_SELECTOR))
}
