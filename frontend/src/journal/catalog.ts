import type { BlockData, CatalogEntry } from '@/types/journal-block'

/** Block 选择面板的目录。顺序即面板里的展示顺序。 */
export const CATALOG: readonly CatalogEntry[] = [
  { type: 'paragraph', label: '正文', icon: '文', category: '文字', description: '一段普通文字' },
  { type: 'heading', label: '小标题', icon: '题', category: '文字', description: '划分日记章节' },
  { type: 'quote', label: '引用', icon: '引', category: '文字', description: '一句想记住的话' },
  { type: 'callout', label: '提示卡片', icon: '记', category: '文字', description: '重点、提醒、心得或注意事项' },
  { type: 'facts', label: '信息清单', icon: '值', category: '文字', description: '成对展示名称与内容' },
  { type: 'pros-cons', label: '优缺点', icon: '衡', category: '文字', description: '并排记录喜欢与遗憾' },
  { type: 'table', label: '表格', icon: '表', category: '文字', description: '整理价格、对比或行程资料' },
  { type: 'link-card', label: '链接卡片', icon: '链', category: '文字', description: '收藏攻略、店铺或预订页面' },
  { type: 'checklist', label: '清单', icon: '单', category: '记录', description: '待办、行李或打卡清单' },
  { type: 'rating', label: '评分', icon: '星', category: '记录', description: '评分并写一句感受' },
  { type: 'stats', label: '数字亮点', icon: '数', category: '记录', description: '里程、步数、照片等关键数字' },
  { type: 'companions', label: '同行的人', icon: '人', category: '记录', description: '记录旅伴、角色与小故事' },
  { type: 'trip-info', label: '旅行信息', icon: '旅', category: '旅行', description: '日期、地点、天气与心情' },
  { type: 'route', label: '路线', icon: '线', category: '旅行', description: '按顺序记录途经地点' },
  { type: 'itinerary', label: '行程', icon: '程', category: '旅行', description: '时间、活动与地址' },
  { type: 'timeline', label: '时间线', icon: '时', category: '旅行', description: '按时间串起一天' },
  { type: 'expense-summary', label: '花费', icon: '账', category: '旅行', description: '分类金额与合计' },
  { type: 'location-card', label: '地点卡片', icon: '地', category: '旅行', description: '地点、地址、开放时间与感受' },
  { type: 'food', label: '美食记录', icon: '食', category: '旅行', description: '菜品、店铺、价格与评分' },
  { type: 'stay', label: '住宿记录', icon: '宿', category: '旅行', description: '酒店、房型、晚数与体验' },
  { type: 'transport', label: '交通记录', icon: '车', category: '旅行', description: '起终点、班次、时长与备注' },
  { type: 'weather', label: '天气记录', icon: '晴', category: '旅行', description: '天气、温度、风和体感' },
  { type: 'image', label: '单张图片', icon: '图', category: '图片', description: '图片、图注与尺寸' },
  { type: 'gallery', label: '图片组', icon: '组', category: '图片', description: '网格、故事或胶片条' },
  { type: 'postcard', label: '旅行明信片', icon: '片', category: '图片', description: '图片搭配地点、寄语和署名' },
  { type: 'divider', label: '分隔线', icon: '—', category: '排版', description: '在章节之间留出呼吸' },
  // 一天的开头、中间和结尾。三个都能从旅行工作台自动填，作者不用重复录一遍
  { type: 'day-opener', label: '今日开场', icon: '启', category: '旅行', description: '城市、第几天、天气、路线与关键数字' },
  { type: 'chapter', label: '章节节点', icon: '节', category: '排版', description: '用时间把一天分成几段' },
  { type: 'day-summary', label: '今日小结', icon: '结', category: '旅行', description: '最喜欢、最好吃、走了多少、花了多少' },
]

/** 各类型 Block 新建时的初始数据。createBlock 会深拷贝，调用方拿到的互不共享。 */
export const BLOCK_DEFAULTS: Record<string, BlockData> = {
  heading: { text: '', level: 2 },
  paragraph: { text: '' },
  quote: { text: '', source: '' },
  callout: { tone: 'note', icon: '', text: '' },
  facts: { items: [{ label: '', value: '' }] },
  'pros-cons': { pros: [''], cons: [''] },
  table: { headers: ['项目', '内容'], rows: [['', '']] },
  'link-card': { url: '', title: '', description: '' },
  rating: { score: 0, max: 5, comment: '' },
  checklist: { items: [{ text: '', checked: false }] },
  stats: { items: [{ value: '', label: '' }] },
  companions: { items: [{ name: '', role: '', note: '' }] },
  'trip-info': { date: '', city: '', tripTitle: '', weather: '', mood: '' },
  route: { items: [''] },
  itinerary: { items: [{ time: '', title: '', address: '' }] },
  timeline: { items: [{ time: '', title: '', description: '' }] },
  'expense-summary': { currency: 'CNY', total: 0, categories: [{ name: '', amount: 0 }] },
  'location-card': { name: '', address: '', hours: '', cost: '', impression: '' },
  food: { dish: '', restaurant: '', price: '', rating: 0, note: '' },
  stay: { name: '', room: '', nights: 1, rating: 0, note: '' },
  transport: { mode: '', from: '', to: '', number: '', duration: '', note: '' },
  weather: { condition: '', temperature: '', feelsLike: '', wind: '', note: '' },
  image: { mediaId: null, caption: '' },
  gallery: { mediaIds: [], caption: '' },
  postcard: { mediaId: null, location: '', date: '', message: '', signature: '' },
  divider: {},
  'day-opener': { city: '', dayLabel: '', date: '', weather: '', route: [], metrics: [] },
  chapter: { time: '', title: '', note: '' },
  'day-summary': { items: [{ icon: '🌟', label: '今天最喜欢', value: '' }] },
}

/** 有图片的三种 Block 共用一组表现设置。 */
export const MEDIA_BLOCK_TYPES = ['image', 'gallery', 'postcard'] as const

/**
 * 日记模板里，一个区块在「生成日记」那一刻的行为。
 *
 * 模板能选的区块和上面的 CATALOG 完全一致，但生成时它们的来路不同：
 *
 * - `auto`     从旅行工作台取数自动填。对应范围内没有记录时整块跳过，并在结果里报给作者。
 * - `prompt`   生成前由作者在「用模板开始写作」里当场填。
 * - `skeleton` 生成一块结构完整、内容待填的空区块，作者到编辑器里点开就写。
 *
 * 之所以有 `skeleton` 这一档：模板负责的是「这篇日记由哪些块按什么顺序组成」，
 * 不该把 29 种区块的编辑表单在模板里再实现一遍。没列进下面两张表的类型都归 `skeleton`。
 *
 * 后端 JournalTemplateService 的 AUTO / PROMPTED 两个集合和这里一一对应，两边必须同时改。
 */
export type TemplateBlockMode = 'auto' | 'prompt' | 'skeleton'

/** 从旅行数据自动带出的区块。trip-info 的日期和城市自动填，天气心情仍要作者写，所以不在其中。 */
const TEMPLATE_AUTO_TYPES = ['route', 'itinerary', 'expense-summary']
/** 生成日记时需要作者当场填内容的区块。 */
const TEMPLATE_PROMPT_TYPES = [
  'trip-info', 'paragraph', 'heading', 'quote', 'rating', 'checklist', 'image', 'gallery', 'postcard',
]

export function templateBlockMode(type: string): TemplateBlockMode {
  if (TEMPLATE_AUTO_TYPES.includes(type)) return 'auto'
  if (TEMPLATE_PROMPT_TYPES.includes(type)) return 'prompt'
  return 'skeleton'
}

/** 模板区块库里每一档的角标与说明。 */
export const TEMPLATE_MODE_HINTS: Record<TemplateBlockMode, { badge: string, hint: string }> = {
  auto: { badge: '自动', hint: '从所属旅行的数据自动整理；对应范围内没有记录时会跳过这一块。' },
  prompt: { badge: '填写', hint: '套用模板时会让你当场填这一块的内容。' },
  skeleton: { badge: '待填', hint: '生成一块空的，套用之后在日记编辑器里点开填写。' },
}

/**
 * 模板里已下线的区块类型 → 正文里对应的真实类型。
 *
 * text（单行）和 textarea（多行）在正文里都是 paragraph，区别只是输入框高度，
 * 那是控件差异不该变成区块类型。库里的老模板由 V31 迁移搬过一次，这里兜住导入的旧 JSON。
 */
const LEGACY_TEMPLATE_TYPES: Record<string, string> = { text: 'paragraph', textarea: 'paragraph' }

export function canonicalTemplateType(type: string): string {
  return LEGACY_TEMPLATE_TYPES[type] ?? type
}
