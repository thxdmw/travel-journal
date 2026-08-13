import { buildCarousel } from './carousel'
import { buildCompare } from './compare'
import { applyResponsiveImages } from './responsive'
import { isEnhanced, restore } from './state'

/*
 * Block 图片组件的运行时增强，公开端和后台实时预览共用。
 * 常规排版使用 CSS；轮播、胶片条和对比组件在渲染后补充交互结构。
 */

/** teardown 时要扫的容器。列全是为了兼容历史内容，最后那条覆盖新的。 */
const ENHANCED_BLOCKS =
  '.journal-gallery--carousel, .journal-gallery--filmstrip, .journal-gallery--compare, .journal-gallery'

/** 扫描 root，给需要行为的图片块补上结构和事件。重复调用是安全的。 */
export function enhance(root: ParentNode | null | undefined): void {
  if (!root) return
  applyResponsiveImages(root)
  root.querySelectorAll('.journal-gallery').forEach(block => {
    if (isEnhanced(block)) return
    /*
     * 区块自己写死的版式优先于主题的默认版式：作者在某一篇里明确选过轮播，
     * 换主题不该把它改回网格。
     */
    const hasExplicitLayout = Array.from(block.classList).some(name => name.startsWith('journal-gallery--'))
    const themeLayout = hasExplicitLayout ? '' : document.documentElement.dataset.galleryLayout
    if (block.classList.contains('journal-gallery--compare')) buildCompare(block)
    else if (block.classList.contains('journal-gallery--carousel') || themeLayout === 'carousel') {
      buildCarousel(block, false)
    } else if (block.classList.contains('journal-gallery--filmstrip') || themeLayout === 'filmstrip') {
      buildCarousel(block, true)
    }
  })
}

/** 还原 enhance 的改动，组件卸载或正文重渲染前调用。 */
export function teardown(root: ParentNode | null | undefined): void {
  if (!root) return
  root.querySelectorAll(ENHANCED_BLOCKS).forEach(restore)
}
