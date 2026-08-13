import type { JournalCard } from '@/types/journal'
import type { RoutePoint } from '@/types/moment'

export const THEME_PREVIEW_IMAGE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#d8cbb4"/>'
  + '<path d="M0 470L230 250l160 150 140-110 370 310H0z" fill="#8da091"/><circle cx="690" cy="150" r="58" fill="#f7e3a1"/></svg>',
)

export const THEME_PREVIEW_HOME_JOURNALS: JournalCard[] = [
  '京都的第三个清晨', '青城山下的一整天', '冰岛公路上的极光', '清迈夜市的一碗面', '威尼斯的水上巴士', '东京深夜的居酒屋',
].map((title, index) => ({
  id: index + 1,
  slug: 'preview',
  title,
  excerpt: '风景会远去，文字让当时的心情重新回来。这一段还在等待被慢慢写完。',
  occurredOn: `2026-0${index % 9 + 1}-12`,
  cityName: ['京都', '成都', '雷克雅未克', '清迈', '威尼斯', '东京'][index] ?? null,
  tripTitle: null,
  tripSlug: null,
  coverUrl: THEME_PREVIEW_IMAGE,
}))

export const THEME_PREVIEW_JOURNAL_DOCUMENT = {
  schemaVersion: 1,
  blocks: [
    { id: 'preview-day-opener', type: 'day-opener', version: 1, title: '', data: { city: '成都', dayLabel: 'Day 2', date: '2026-08-10', weather: '晴', route: ['成都', '都江堰', '青城山'], metrics: [{ value: '21,430', label: '步' }, { value: '¥ 420', label: '花费' }] }, settings: {} },
    { id: 'preview-chapter', type: 'chapter', version: 1, title: '', data: { time: '08:30', title: '清晨出发', note: '从成都出发，一路向西' }, settings: {} },
    { id: 'preview-heading', type: 'heading', version: 1, title: '', data: { text: '都江堰的水声', level: 2 }, settings: {} },
    { id: 'preview-paragraph', type: 'paragraph', version: 1, title: '', data: { text: '站在鱼嘴分水堤上，能听见很远就传来的水声。两千多年前的工程，到现在还在按原来的方式分水。' }, settings: { style: 'normal', align: 'left' } },
    { id: 'preview-quote', type: 'quote', version: 1, title: '', data: { text: '有些风景，只有慢下来才看得见。', source: '旅途手记' }, settings: {} },
    { id: 'preview-callout', type: 'callout', version: 1, title: '', data: { tone: 'tip', icon: '✦', text: '下午三点后人会少很多，适合拍照。' }, settings: {} },
    { id: 'preview-location', type: 'location-card', version: 1, title: '', data: { name: '青城山', address: '成都市都江堰市青城山镇', hours: '08:00–17:30', cost: '80 元', impression: '树荫很多，山路不算陡，适合慢慢走完一整圈。' }, settings: {} },
    { id: 'preview-timeline', type: 'timeline', version: 1, title: '', data: { items: [{ time: '09:30', title: '进入山门', description: '买了一份地图，沿着主路上山' }, { time: '11:50', title: '到达上清宫', description: '在这里歇脚吃了午饭' }, { time: '15:20', title: '下山回到街子古镇', description: '喝了一下午的茶' }] }, settings: {} },
    { id: 'preview-stats', type: 'stats', version: 1, title: '', data: { items: [{ value: '18,642', label: '步' }, { value: '12.8 km', label: '路程' }, { value: '86', label: '张照片' }] }, settings: {} },
    { id: 'preview-image', type: 'image', version: 1, title: '', data: { previewUrl: THEME_PREVIEW_IMAGE, caption: '山间的一刻' }, settings: {} },
    { id: 'preview-gallery', type: 'gallery', version: 1, title: '', data: { previewUrls: [THEME_PREVIEW_IMAGE, THEME_PREVIEW_IMAGE, THEME_PREVIEW_IMAGE], caption: '这一天拍的照片' }, settings: {} },
    { id: 'preview-divider', type: 'divider', version: 1, title: '', data: {}, settings: {} },
    { id: 'preview-day-summary', type: 'day-summary', version: 1, title: '', data: { items: [{ icon: '🌟', label: '今天最喜欢', value: '都江堰的水声' }, { icon: '💴', label: '今日花费', value: '¥ 420' }] }, settings: {} },
  ],
}

export const THEME_PREVIEW_ROUTE_POINTS: RoutePoint[] = [
  { order: 1, time: '09:00', title: '成都', note: '从市区出发', latitude: 30.6598, longitude: 104.0633, coordinateSystem: 'WGS84', photos: [], source: 'moment' },
  { order: 2, time: '10:30', title: '都江堰', note: '看鱼嘴分水堤', latitude: 31.0044, longitude: 103.6053, coordinateSystem: 'WGS84', photos: [], source: 'moment' },
  { order: 3, time: '12:00', title: '青城山', note: '爬到上清宫', latitude: 30.9021, longitude: 103.5678, coordinateSystem: 'WGS84', photos: [], source: 'moment' },
  { order: 4, time: '17:00', title: '成都', note: '回到市区', latitude: 30.6598, longitude: 104.0633, coordinateSystem: 'WGS84', photos: [], source: 'moment' },
]
