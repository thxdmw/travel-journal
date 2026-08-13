import type { StickerItem, ThemeDefinition } from '@/types/theme'

/*
 * 主题贴纸。
 *
 * 位置来自一份很短的白名单（hero-left、section-gap 之类），主题只表达
 * 「放在页眉右边」这种意图，真正贴在哪由 CSS 决定——绝对坐标在手机上一定会错位。
 * 素材名只允许小写字母、数字和短横线（后端也校验一遍），拼出来的路径固定指向
 * /assets/themes/stickers/ 下的 SVG，主题配置里不会出现任意 URL。
 */

export const STICKER_AREAS = [
  'hero-left',
  'hero-right',
  'page-left',
  'page-right',
  'section-gap',
  'image-corner',
  'footer',
] as const

export type StickerArea = (typeof STICKER_AREAS)[number]

/** 素材名白名单：小写字母数字，短横线分隔，不允许路径符号。 */
export const SAFE_ASSET = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** 需要挂到正文内容上的区域，其余直接贴在视口层。 */
const ANCHORED_AREAS: readonly string[] = ['section-gap', 'image-corner', 'footer']

export function isStickerArea(value: unknown): value is StickerArea {
  return typeof value === 'string' && (STICKER_AREAS as readonly string[]).includes(value)
}

/** 视口层。粒子画布和非锚定贴纸都挂在它下面。 */
export function effectLayer(): HTMLElement {
  let element = document.querySelector<HTMLElement>('.tj-effect-layer')
  if (!element) {
    element = document.createElement('div')
    element.className = 'tj-effect-layer'
    element.setAttribute('aria-hidden', 'true')
    document.body.appendChild(element)
  }
  return element
}

/** 锚定型贴纸要挂到哪个内容元素上。找不到合适的宿主就返回 null，那枚贴纸不渲染。 */
export function contentAnchor(area: string, index: number): Element | null {
  if (area === 'section-gap') {
    const chapters = document.querySelectorAll('.journal-document > .journal-block--chapter')
    if (chapters.length) return chapters[index % chapters.length] ?? null
    const blocks = document.querySelectorAll('.journal-document > .journal-block')
    if (blocks.length) {
      return blocks[Math.min(blocks.length - 1, 2 + ((index * 3) % Math.max(1, blocks.length - 2)))] ?? null
    }
    const sections = document.querySelectorAll('.public-shell > section, main > section')
    return sections.length ? (sections[index % sections.length] ?? null) : null
  }
  if (area === 'image-corner') {
    const figures = document.querySelectorAll('.journal-document .journal-figure, .journal-document .journal-gallery')
    if (figures.length) return figures[index % figures.length] ?? null
    const images = document.querySelectorAll('.hero-photo, .trip-card__cover, .journal-card__cover')
    return images.length ? (images[index % images.length] ?? null) : null
  }
  if (area === 'footer') return document.querySelector('.public-footer, .article-footer, body > footer')
  return null
}

/** 清掉上一轮的贴纸和它们留下的锚点标记。 */
export function clearStickers(): void {
  document.querySelectorAll('.tj-sticker').forEach(element => element.remove())
  document.querySelectorAll('.tj-sticker-anchor').forEach(element => element.classList.remove('tj-sticker-anchor'))
}

function createSticker(asset: string, area: string, clickInteraction: string | undefined): HTMLElement {
  /*
   * 用 span + 背景图而不是 <img>：主题装饰和正文照片必须在 DOM 语义上彻底分开，
   * 否则灯箱的收图逻辑会把贴纸也当成照片收进去。这一条不能改。
   */
  const element = document.createElement('span')
  element.className = 'tj-sticker tj-sticker--' + area
  element.dataset.themeDecoration = 'sticker'
  element.style.backgroundImage = 'url(/assets/themes/stickers/' + asset + '.svg)'
  element.setAttribute('aria-hidden', 'true')
  // 贴纸互动也走白名单：主题只能说「点一下弹一下」，不能带任何脚本
  if (clickInteraction && clickInteraction !== 'none') {
    element.dataset.interaction = clickInteraction
    element.addEventListener('click', () => {
      element.classList.remove('is-playing')
      void element.offsetWidth // 重启动画，连点两下也有反馈
      element.classList.add('is-playing')
    })
  }
  return element
}

/** 按当前主题重建贴纸。传入的 definition 为空时只做清理。 */
export function syncStickers(definition: ThemeDefinition | null | undefined): void {
  clearStickers()
  const config = definition?.stickers
  if (!config || config.density === 'none' || !config.density) return
  if (!Array.isArray(config.items) || !config.items.length) return

  const viewportHost = effectLayer()
  const areaIndex: Record<string, number> = {}
  for (const raw of config.items as StickerItem[]) {
    const asset = String(raw?.asset ?? '')
    const area = String(raw?.area ?? '')
    if (!SAFE_ASSET.test(asset) || !isStickerArea(area)) continue

    const anchored = ANCHORED_AREAS.includes(area)
    const index = areaIndex[area] ?? 0
    areaIndex[area] = index + 1
    const host = anchored ? contentAnchor(area, index) : viewportHost
    if (!host) continue

    const element = createSticker(asset, area, document.documentElement.dataset.interactionsStickerClick)
    if (anchored) {
      host.classList.add('tj-sticker-anchor')
      element.classList.add('tj-sticker--anchored')
    }
    host.appendChild(element)
  }
}
