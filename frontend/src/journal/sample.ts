import { canonicalTemplateType } from './catalog'
import { createBlock } from './document'
import type { BlockData, JournalDocument, SampleDefinition } from '@/types/journal-block'

/**
 * 模板预览用的占位图。
 *
 * 内联 SVG 而不是引一张站内图片：模板预览可能在还没有任何媒体的空站点上打开，
 * 引外部资源会变成一个碎图。
 */
const SAMPLE_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#d8cbb4"/><path d="M0 470L230 250l160 150 140-110 370 310H0z" fill="#8da091"/><circle cx="690" cy="150" r="58" fill="#f7e3a1"/><text x="450" y="550" text-anchor="middle" font-size="32" fill="#44564d">旅行照片</text></svg>',
  )

/** 各类型的示例内容。写成一趟青城山，比 Lorem ipsum 更能看出排版实际效果。 */
function samples(definition: SampleDefinition): Record<string, BlockData> {
  return {
    'trip-info': { date: '2026-08-09', city: '成都', tripTitle: '青城山一日游', weather: '晴', mood: '松弛' },
    paragraph: { text: '路上的风、偶遇的人和当时的心情，都会在这里成为一段完整记录。' },
    heading: { text: '下山之后', level: 2 },
    quote: { text: '有些风景，只有慢下来才看得见。', source: '旅途手记' },
    rating: { score: 4, max: definition.config?.max || 5, comment: '值得再来' },
    callout: { tone: 'memory', icon: '✦', text: '今天最想记住的，是下山时吹来的那阵风。' },
    facts: {
      items: [
        { label: '最佳时间', value: '清晨 8 点前' },
        { label: '建议停留', value: '半天' },
      ],
    },
    'pros-cons': { pros: ['风景安静', '交通方便'], cons: ['周末游客较多'] },
    table: {
      headers: ['项目', '记录'],
      rows: [
        ['门票', '80 元'],
        ['用时', '约 5 小时'],
      ],
    },
    'link-card': { url: 'https://example.com', title: '旅行攻略与预约信息', description: '出发前收藏的参考页面' },
    checklist: {
      items: [
        { text: '看日落', checked: true },
        { text: '寄明信片', checked: false },
      ],
    },
    stats: {
      items: [
        { value: '18,642', label: '步' },
        { value: '12.8 km', label: '路程' },
        { value: '86', label: '张照片' },
      ],
    },
    companions: { items: [{ name: '小满', role: '旅伴', note: '负责发现好吃的小店' }] },
    route: { items: ['成都', '青城山', '街子古镇'] },
    itinerary: {
      items: [
        { time: '09:30', title: '进入山门', address: '青城山景区' },
        { time: '15:20', title: '古镇喝茶', address: '街子古镇' },
      ],
    },
    'expense-summary': {
      currency: 'CNY',
      total: 268,
      categories: [
        { name: '交通', amount: 88 },
        { name: '餐饮', amount: 180 },
      ],
    },
    'location-card': {
      name: '青城山',
      address: '成都市都江堰市',
      hours: '08:00–17:30',
      cost: '80 元',
      impression: '树荫很多，适合慢慢走。',
    },
    food: { dish: '青城老腊肉', restaurant: '山门小馆', price: '68 元', rating: 4, note: '咸香，很下饭。' },
    stay: { name: '山里民宿', room: '庭院大床房', nights: 1, rating: 5, note: '晚上非常安静。' },
    transport: {
      mode: '高铁',
      from: '成都犀浦',
      to: '青城山',
      number: 'C6103',
      duration: '约 30 分钟',
      note: '建议提前取票。',
    },
    weather: { condition: '晴间多云', temperature: '26°C', feelsLike: '25°C', wind: '微风', note: '树荫下很凉快。' },
    image: { previewUrl: SAMPLE_IMAGE, caption: '山间的一刻' },
    gallery: { previewUrls: [SAMPLE_IMAGE, SAMPLE_IMAGE, SAMPLE_IMAGE], caption: '旅途照片' },
    postcard: {
      previewUrl: SAMPLE_IMAGE,
      location: '成都',
      date: '2026-08-09',
      message: '愿下一次出发时，我们依然对世界好奇。',
      signature: '远行手记',
    },
    'day-opener': {
      city: '成都',
      dayLabel: 'Day 2',
      date: '2026-08-09',
      weather: '晴',
      route: ['犀浦', '青城山', '街子古镇'],
      metrics: [
        { value: '18,642', label: '步' },
        { value: '268', label: '元' },
      ],
    },
    chapter: { time: '08:30', title: '清晨', note: '山门口只有几个人' },
    'day-summary': {
      items: [
        { icon: '🌟', label: '今天最喜欢', value: '下山时的那阵风' },
        { icon: '🍜', label: '今天最好吃', value: '青城老腊肉' },
      ],
    },
    divider: {},
  }
}

/** 按模板定义生成一份示例正文，供模板管理页预览排版。 */
export function sampleDocument(definitions?: readonly SampleDefinition[] | null): JournalDocument {
  const blocks = (definitions ?? []).map(definition => {
    // 导入的老模板可能仍带着已下线的 text / textarea，先搬成正文里的真实类型
    const type = canonicalTemplateType(definition.type)
    return createBlock(type, {
      // 标题自己就是一行字，再挂一个区块标题会连着出现两行；分隔线同理没有标题
      title: type === 'heading' || type === 'divider' ? '' : definition.title,
      data: samples(definition)[type] ?? {},
    })
  })
  return { schemaVersion: 1, blocks }
}

export { SAMPLE_IMAGE }
