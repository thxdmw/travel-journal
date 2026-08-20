import { normalize } from './document'
import { arr, clamp, esc, formatDay, lines, num, rec, safeLink, str } from './escape'
import type { BlockData, JournalBlock, RenderableMedia } from '@/types/journal-block'

export type MediaMap = Map<number, RenderableMedia>

export function mediaMap(media: readonly RenderableMedia[] | null | undefined): MediaMap {
  const map: MediaMap = new Map()
  for (const item of media ?? []) map.set(Number(item.id), item)
  return map
}

/** 没有随正文一起取到媒体信息时，按 id 拼出站内地址兜底。 */
function mediaUrl(item: RenderableMedia | undefined, mediaId: unknown): string {
  return item?.displayUrl ? item.displayUrl : '/api/media/' + Number(mediaId) + '/display'
}

/**
 * 只认站内媒体地址的三档形态，其余（本机预览 blob、外链）一概不动。
 *
 * 末尾的查询串要单独捕获再原样带回每一档：草稿预览链接的图片地址长这样
 * `/api/media/10/display?previewToken=xxx`，令牌丢了就是 403。以前正则不接受
 * 查询串，于是正式文章有响应式尺寸，草稿预览却在手机上照样下 1280 那张。
 */
const MEDIA_VARIANTS = /^(.*\/api\/media\/\d+)\/(?:display|medium|thumbnail)(\?.*)?$/

/**
 * 图片标签的公共属性：站内图片直接带上 srcset，让浏览器一次就挑对尺寸。
 *
 * 以前 srcset 是渲染完再由 media/responsive.ts 补的，那样浏览器要加载两次：
 * `<img src=".../display">` 一插进 DOM 就开始下 1280 那张，等 srcset 补上之后又
 * 按 sizes 重新评估、换一档重新下——图片先空一下再出现，就是打开图片配置弹窗时
 * 看到的那一下闪烁。属性跟着 HTML 一起出生就没有第二次评估了。
 *
 * 带上 data-responsive 让 applyResponsiveImages 认出「这张已经处理过」，它继续
 * 为不经这里渲染的存量路径兜底。
 */
function imageAttrs(src: string, image: ImageMode, item?: RenderableMedia): string {
  const match = src.match(MEDIA_VARIANTS)
  const base = match?.[1]
  const responsive = base
    ? ' srcset="' + esc(mediaSrcset(base, match?.[2] ?? ''))
      + '" sizes="' + esc(image.sizes) + '" data-responsive="on"'
    : ''
  return ' src="' + esc(src) + '"' + responsive + intrinsicSize(item)
    + (image.eager ? ' loading="eager" decoding="sync"' : ' loading="lazy" decoding="async"')
}

/**
 * 图片怎么加载。
 *
 * <p>正文和公开端一律 lazy + async：一篇日记几十张图，滚到哪儿加载到哪儿，绝不为了图片
 * 推迟正文出现。</p>
 *
 * <p>编辑器里的小预览反过来。那里的图只有两百来像素、就在眼前，lazy 那轮可见性判断毫无
 * 用处；而 async 的意思正是「先画周围、图晚一点补上」——每次内容重建都会露出一帧空框，
 * 看起来就是预览闪了一下。sync 让浏览器画这一帧之前先把图解好，图文一起出现。</p>
 */
interface ImageMode {
  sizes: string
  eager: boolean
}

/**
 * 原图的像素尺寸。
 *
 * 有了 width/height，浏览器在图片下载完之前就知道它的长宽比，能先把位置留出来。少了它
 * 每张图都是「先 0 高度、加载完再撑开」：正文里滚动位置会跳，配置弹窗的等比缩放会先按
 * 「没有图片」的高度算一遍、图片就位后再跳到实际比例——看起来就是闪一下。
 *
 * CSS 里图片一律是 `width:auto; max-width:100%; height:auto`，所以这两个属性只提供比例，
 * 不会把图片钉死在原始尺寸上。
 */
function intrinsicSize(item?: RenderableMedia): string {
  const width = Number(item?.width)
  const height = Number(item?.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return ''
  return ' width="' + Math.round(width) + '" height="' + Math.round(height) + '"'
}

/**
 * 三档候选图。
 *
 * 导出给 media/responsive.ts 复用：两条路径必须给出完全一样的候选集，
 * 否则同一张图经不同路径处理会被浏览器挑成不同尺寸。
 */
export function mediaSrcset(base: string, query = ''): string {
  return base + '/thumbnail' + query + ' 480w, '
    + base + '/medium' + query + ' 768w, '
    + base + '/display' + query + ' 1280w'
}

/** 正文里的图默认占内容宽度的 68%，猜小了会糊，所以宁可往大了写。 */
const RESPONSIVE_SIZES = '(max-width: 700px) 92vw, (max-width: 1100px) 78vw, 68vw'

/**
 * 编辑器里那些小预览用的尺寸提示。
 *
 * 区块列表的缩略图和图片配置弹窗里的「正文效果」都只有一两百像素宽，套用正文那套
 * 92vw 的话，浏览器按手机屏幕算出上千设备像素，转头就去下 1280 那一档——为了画一张
 * 200px 的图解码一整张大图，在手机上就是打开弹窗时的那一下卡顿。
 */
export const PREVIEW_SIZES = '240px'

/**
 * 「预览全文」对话框里的正文宽度提示。
 *
 * 对话框是 min(900px, 96vw)，扣掉两层内边距，正文图片实际只有两三百像素宽（手机）到
 * 五百多（桌面）。沿用正文那套 92vw 会让手机去挑 1280 那一档——一篇十几张图的日记
 * 打开预览就是十几次大图解码。
 */
export const ARTICLE_PREVIEW_SIZES = '(max-width: 700px) 50vw, 560px'

/** 渲染选项。 */
export interface RenderOptions {
  /** 覆盖 sizes。只影响浏览器挑哪一档图，不改变版式和输出结构。 */
  sizes?: string
  /**
   * 图片抢在这一帧画出来，而不是晚一步补上。
   *
   * 编辑器里的小预览专用，理由见 {@link ImageMode}。正文和公开端不要开。
   */
  eager?: boolean
}

function blockTitle(block: JournalBlock): string {
  return block.title ? '<h2 class="journal-block__title">' + esc(block.title) + '</h2>' : ''
}

/**
 * 图片区块的表现类名。
 *
 * size / align 没有显式选择时不输出覆盖类，让主题的 image.width 等默认值真正生效。
 * 旧内容已经保存了明确值时仍按区块设置优先，不改变既有日记的排版。
 */
function figureClasses(settings: BlockData, extra?: string): string {
  const values: string[] = []
  if (settings.size) values.push('journal-figure--' + str(settings.size))
  if (settings.align) values.push('journal-figure--' + str(settings.align))
  for (const key of ['ratio', 'focus', 'frame', 'radius', 'effect', 'captionPos']) {
    if (settings[key]) {
      values.push('journal-figure--' + (key === 'captionPos' ? 'caption' : key) + '-' + str(settings[key]))
    }
  }
  if (extra) values.push(extra)
  return values.map(esc).join(' ')
}

function figure(block: JournalBlock, map: MediaMap, image: ImageMode): string {
  const data = block.data
  const settings = block.settings
  const item = map.get(Number(data.mediaId))
  if (!data.mediaId && !data.previewUrl) return ''
  const caption = str(data.caption) || str(item?.caption) || ''
  const src = data.previewUrl ? str(data.previewUrl) : mediaUrl(item, data.mediaId)
  return (
    '<figure class="journal-figure ' +
    figureClasses(settings) +
    '"><img' +
    imageAttrs(src, image, item) +
    ' alt="' +
    esc(caption || '旅行照片') +
    '">' +
    (caption ? '<figcaption>' + esc(caption) + '</figcaption>' : '') +
    '</figure>'
  )
}

function gallery(block: JournalBlock, map: MediaMap, image: ImageMode): string {
  const data = block.data
  const settings = block.settings
  const ids = arr(data.mediaIds)
  const previews = arr(data.previewUrls)
  if (!ids.length && !previews.length) return ''
  const mode = str(settings.layout)
  const columns = settings.columns == null ? null : clamp(num(settings.columns, 3), 1, 6)
  const sources = previews.length ? previews : ids
  // 对比模式只放两张，多出来的不渲染
  const visibleSources = mode === 'compare' ? sources.slice(0, 2) : sources
  const images = visibleSources
    .map(source => {
      const item = map.get(Number(source))
      const caption = str(item?.caption) || '旅行照片'
      // previews 分支里 source 本身就是地址，不是 id
      const src = previews.length ? str(source) : mediaUrl(item, source)
      return '<img' + imageAttrs(src, image, item) + ' alt="' + esc(caption) + '">'
    })
    .join('')
  const layoutClass = mode ? 'journal-gallery--' + mode : ''
  const columnsClass = columns == null ? '' : ' journal-gallery--cols-' + columns
  return (
    '<figure class="journal-gallery ' +
    figureClasses(settings, layoutClass) +
    columnsClass +
    '">' +
    images +
    (data.caption ? '<figcaption>' + esc(data.caption) + '</figcaption>' : '') +
    '</figure>'
  )
}

function postcard(block: JournalBlock, map: MediaMap, image: ImageMode): string {
  const data = block.data
  const item = map.get(Number(data.mediaId))
  const src = data.previewUrl ? str(data.previewUrl) : mediaUrl(item, data.mediaId)
  const picture =
    data.mediaId || data.previewUrl
      ? '<img' + imageAttrs(src, image, item) + ' alt="' + esc(str(data.location) || '旅行明信片') + '">'
      : '<div class="journal-postcard__placeholder">旅行明信片</div>'
  return (
    '<figure class="journal-postcard">' +
    picture +
    '<div class="journal-postcard__writing">' +
    '<div class="journal-postcard__meta"><span>' +
    esc(data.location) +
    '</span><time>' +
    esc(data.date) +
    '</time></div>' +
    '<p>' +
    lines(data.message) +
    '</p>' +
    (data.signature ? '<footer>— ' + esc(data.signature) + '</footer>' : '') +
    '</div></figure>'
  )
}

/** 遍历一个可能不是数组的列表字段。每项都当成记录读，混进 null 也不会炸。 */
function listItems(items: unknown, renderer: (item: Record<string, unknown>) => string): string {
  return arr(items)
    .map(item => renderer(rec(item)))
    .join('')
}

/** 星级。评分区块和美食、住宿都用，统一夹在 0..max 之间。 */
function stars(score: number, max: number): string {
  return '★'.repeat(score) + '☆'.repeat(max - score)
}

function renderBody(block: JournalBlock, map: MediaMap, image: ImageMode): string | null {
  const d = block.data
  const s = block.settings
  switch (block.type) {
    case 'heading': {
      const level = clamp(num(d.level, 2), 2, 4)
      return '<h' + level + ' class="journal-heading">' + esc(d.text) + '</h' + level + '>'
    }
    case 'paragraph':
      return (
        '<p class="journal-paragraph journal-paragraph--' +
        esc(str(s.style) || 'normal') +
        ' journal-text--' +
        esc(str(s.align) || 'left') +
        '">' +
        lines(d.text) +
        '</p>'
      )
    case 'quote':
      return (
        '<blockquote><p>' +
        lines(d.text) +
        '</p>' +
        (d.source ? '<cite>— ' + esc(d.source) + '</cite>' : '') +
        '</blockquote>'
      )
    case 'callout':
      return (
        '<aside class="journal-callout journal-callout--' +
        esc(str(d.tone) || 'note') +
        '">' +
        (d.icon ? '<b>' + esc(d.icon) + '</b>' : '') +
        '<p>' +
        lines(d.text) +
        '</p></aside>'
      )
    case 'facts':
      return (
        '<dl class="journal-facts">' +
        listItems(d.items, item => '<div><dt>' + esc(item.label) + '</dt><dd>' + lines(item.value) + '</dd></div>') +
        '</dl>'
      )
    case 'pros-cons':
      return (
        '<div class="journal-pros-cons"><section><h3>喜欢</h3><ul>' +
        arr(d.pros).map(item => '<li>' + esc(item) + '</li>').join('') +
        '</ul></section><section><h3>遗憾</h3><ul>' +
        arr(d.cons).map(item => '<li>' + esc(item) + '</li>').join('') +
        '</ul></section></div>'
      )
    case 'table': {
      const headers = arr(d.headers)
      const rows = arr(d.rows)
      return (
        '<div class="journal-table-wrap"><table class="journal-table"><thead><tr>' +
        headers.map(x => '<th>' + esc(x) + '</th>').join('') +
        '</tr></thead><tbody>' +
        rows
          .map(
            row =>
              '<tr>' +
              // 用 || 而不是 ??：单元格填 0 时原实现渲染的是空格子，保持一致
              headers.map((_header, index) => '<td>' + lines(arr(row)[index] || '') + '</td>').join('') +
              '</tr>',
          )
          .join('') +
        '</tbody></table></div>'
      )
    }
    case 'link-card':
      return (
        '<a class="journal-link-card" href="' +
        esc(safeLink(d.url)) +
        '" target="_blank" rel="noopener noreferrer"><strong>' +
        esc(d.title || d.url) +
        '</strong>' +
        (d.description ? '<span>' + lines(d.description) + '</span>' : '') +
        '<small>' +
        esc(d.url) +
        '</small></a>'
      )
    case 'rating': {
      const max = Math.max(1, num(d.max, 5))
      const score = clamp(num(d.score, 0), 0, max)
      return (
        '<div class="journal-rating" aria-label="' +
        score +
        ' / ' +
        max +
        '">' +
        '<span>' +
        stars(score, max) +
        '</span><b>' +
        score +
        '/' +
        max +
        '</b></div>' +
        (d.comment ? '<p>' + lines(d.comment) + '</p>' : '')
      )
    }
    case 'checklist':
      return (
        '<ul class="journal-checklist">' +
        listItems(
          d.items,
          item =>
            '<li class="' +
            (item.checked ? 'is-checked' : '') +
            '"><span>' +
            (item.checked ? '✓' : '') +
            '</span>' +
            esc(item.text) +
            '</li>',
        ) +
        '</ul>'
      )
    case 'stats':
      return (
        '<div class="journal-stats">' +
        listItems(d.items, item => '<div><strong>' + esc(item.value) + '</strong><span>' + esc(item.label) + '</span></div>') +
        '</div>'
      )
    case 'companions':
      return (
        '<div class="journal-companions">' +
        listItems(
          d.items,
          item =>
            '<article><strong>' +
            esc(item.name) +
            '</strong>' +
            (item.role ? '<span>' + esc(item.role) + '</span>' : '') +
            (item.note ? '<p>' + lines(item.note) + '</p>' : '') +
            '</article>',
        ) +
        '</div>'
      )
    case 'trip-info': {
      const values = [d.date, d.city, d.tripTitle, d.weather, d.mood].filter(Boolean)
      return '<div class="journal-trip-info">' + values.map(value => '<span>' + esc(value) + '</span>').join('') + '</div>'
    }
    case 'route':
      return '<ol class="journal-route">' + arr(d.items).map(item => '<li>' + esc(item) + '</li>').join('') + '</ol>'
    case 'itinerary':
    case 'timeline':
      return (
        '<ol class="journal-timeline">' +
        listItems(
          d.items,
          item =>
            '<li><time>' +
            esc(item.time) +
            '</time><div><strong>' +
            esc(item.title) +
            '</strong>' +
            (item.address ? '<small>' + esc(item.address) + '</small>' : '') +
            (item.description ? '<p>' + lines(item.description) + '</p>' : '') +
            '</div></li>',
        ) +
        '</ol>'
      )
    case 'expense-summary':
      return (
        '<div class="journal-expenses"><ul>' +
        listItems(
          d.categories,
          item => '<li><span>' + esc(item.name) + '</span><b>' + esc(d.currency || '') + ' ' + esc(item.amount) + '</b></li>',
        ) +
        '</ul><div class="journal-expenses__total"><span>合计</span><strong>' +
        esc(d.currency || '') +
        ' ' +
        esc(d.total) +
        '</strong></div></div>'
      )
    case 'location-card':
      return (
        '<article class="journal-place-card"><header><strong>' +
        esc(d.name) +
        '</strong>' +
        (d.cost ? '<b>' + esc(d.cost) + '</b>' : '') +
        '</header>' +
        (d.address ? '<span>' + esc(d.address) + '</span>' : '') +
        (d.hours ? '<small>开放时间：' + esc(d.hours) + '</small>' : '') +
        (d.impression ? '<p>' + lines(d.impression) + '</p>' : '') +
        '</article>'
      )
    case 'food':
      return (
        '<article class="journal-record-card journal-food"><header><strong>' +
        esc(d.dish) +
        '</strong><span>' +
        esc(d.restaurant) +
        '</span></header>' +
        '<div>' +
        (d.price ? '<b>' + esc(d.price) + '</b>' : '') +
        (d.rating ? '<span>' + '★'.repeat(clamp(num(d.rating, 0), 0, 5)) + '</span>' : '') +
        '</div>' +
        (d.note ? '<p>' + lines(d.note) + '</p>' : '') +
        '</article>'
      )
    case 'stay':
      return (
        '<article class="journal-record-card journal-stay"><header><strong>' +
        esc(d.name) +
        '</strong><span>' +
        esc(d.room) +
        '</span></header>' +
        '<div><b>' +
        esc(d.nights || 1) +
        ' 晚</b>' +
        (d.rating ? '<span>' + '★'.repeat(clamp(num(d.rating, 0), 0, 5)) + '</span>' : '') +
        '</div>' +
        (d.note ? '<p>' + lines(d.note) + '</p>' : '') +
        '</article>'
      )
    case 'transport':
      return (
        '<article class="journal-transport"><b>' +
        esc(str(d.mode) || '交通') +
        '</b><div><strong>' +
        esc(d.from) +
        '</strong><i>→</i><strong>' +
        esc(d.to) +
        '</strong></div>' +
        '<small>' +
        [d.number, d.duration].filter(Boolean).map(esc).join(' · ') +
        '</small>' +
        (d.note ? '<p>' + lines(d.note) + '</p>' : '') +
        '</article>'
      )
    case 'weather':
      return (
        '<div class="journal-weather"><strong>' +
        esc(d.condition) +
        '</strong><b>' +
        esc(d.temperature) +
        '</b><span>' +
        [d.feelsLike && '体感 ' + str(d.feelsLike), d.wind].filter(Boolean).map(esc).join(' · ') +
        '</span>' +
        (d.note ? '<p>' + lines(d.note) + '</p>' : '') +
        '</div>'
      )
    /*
     * 今日开场卡。
     *
     * 「东京 · Day 4 / 8月10日 · 晴 / 浅草 → 上野 → 银座 / 21,430 步 · ¥8,420」——
     * 这些全都能从旅行、行程和账目里推出来，所以编辑器默认关联数据，作者不用填。
     * 空字段直接不渲染，只写了一半也不会留下一行「· ·」。
     */
    case 'day-opener': {
      const head = [d.city, d.dayLabel].filter(Boolean).map(esc).join(' · ')
      const sub = [formatDay(d.date), d.weather].filter(Boolean).map(esc).join(' · ')
      const route = arr(d.route).filter(Boolean)
      const metrics = arr(d.metrics)
        .map(rec)
        .filter(item => item.value || item.label)
      return (
        '<header class="journal-day-opener">' +
        (head ? '<strong>' + head + '</strong>' : '') +
        (sub ? '<span>' + sub + '</span>' : '') +
        (route.length ? '<p class="journal-day-opener__route">' + route.map(esc).join('<i>→</i>') + '</p>' : '') +
        (metrics.length
          ? '<div class="journal-day-opener__metrics">' +
            metrics.map(item => '<div><b>' + esc(item.value) + '</b><span>' + esc(item.label) + '</span></div>').join('') +
            '</div>'
          : '') +
        '</header>'
      )
    }
    // 章节节点：一天里的一个时间锚点。本质是带时间的小标题，让长日记读起来有节奏。
    case 'chapter':
      return (
        '<div class="journal-chapter">' +
        (d.time ? '<time>' + esc(d.time) + '</time>' : '') +
        '<h3>' +
        esc(d.title) +
        '</h3>' +
        (d.note ? '<small>' + esc(d.note) + '</small>' : '') +
        '</div>'
      )
    case 'day-summary': {
      const items = arr(d.items)
        .map(rec)
        .filter(item => item.value || item.label)
      return (
        '<section class="journal-day-summary">' +
        items
          .map(
            item =>
              '<article>' +
              (item.icon ? '<b>' + esc(item.icon) + '</b>' : '') +
              '<div><span>' +
              esc(item.label) +
              '</span><strong>' +
              esc(item.value) +
              '</strong></div></article>',
          )
          .join('') +
        '</section>'
      )
    }
    case 'image':
      return figure(block, map, image)
    case 'gallery':
      return gallery(block, map, image)
    case 'postcard':
      return postcard(block, map, image)
    case 'divider':
      return '<hr>'
    default:
      // 不认识的类型整块跳过，而不是渲染出一个空壳
      return null
  }
}

export function renderBlock(
  block: JournalBlock,
  media?: MediaMap | readonly RenderableMedia[] | null,
  options?: RenderOptions,
): string {
  const map = media instanceof Map ? media : mediaMap(media)
  const body = renderBody(block, map, {
    sizes: options?.sizes ?? RESPONSIVE_SIZES,
    eager: options?.eager ?? false,
  })
  if (body === null) return ''
  return (
    '<section class="journal-block journal-block--' +
    esc(block.type) +
    '" data-block-id="' +
    esc(block.id) +
    '">' +
    // heading 自己就是标题，再套一层 block 标题会出现两级标题
    (block.type === 'heading' ? '' : blockTitle(block)) +
    body +
    '</section>'
  )
}

export function render(source: unknown, media?: readonly RenderableMedia[] | null,
                       options?: RenderOptions): string {
  const map = mediaMap(media)
  return normalize(source)
    .blocks.map(block => renderBlock(block, map, options))
    .join('')
}
