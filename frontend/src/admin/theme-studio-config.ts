export type StudioScalar = string | number | boolean | null
export interface StudioSticker { asset: string, area: string }
export type StudioValue = StudioScalar | StudioSticker[]
export type StudioSection = Record<string, StudioValue>
export interface StudioDefinition {
  colors: StudioSection
  stickers: StudioSection
  hero: StudioSection
  card: StudioSection
  background: StudioSection
  [section: string]: StudioSection
}

export interface SettingField {
  key: string
  label?: string
  type?: 'select' | 'number' | 'switch' | 'color'
  options?: [StudioScalar, string][]
  min?: number
  max?: number
  step?: number
  preview?: PreviewScene
  target?: string
  help?: string
  condition?: (definition: StudioDefinition) => boolean
}
export interface SettingGroup {
  key: string
  label?: string
  preview: PreviewScene
  tier?: 'basic' | 'advanced'
  target?: string
  hint?: string
  fields?: SettingField[]
}
export type PreviewScene = 'home' | 'journal' | 'map'

export const colorFields: [string, string][] = [
  ['background', '页面背景'], ['surface', '内容背景'], ['surfaceSoft', '柔和背景'], ['primary', '主要文字'],
  ['primarySoft', '次级主色'], ['secondary', '辅助色'], ['accent', '强调操作'], ['accentHover', '强调悬停'],
  ['sand', '装饰沙色'], ['text', '正文颜色'], ['muted', '弱化文字'], ['border', '边框颜色'],
  ['danger', '危险提示'], ['gradientFrom', '渐变起色'], ['gradientTo', '渐变止色'],
]

export const defaultDefinition: StudioDefinition = {
  colors: { background: '#F7F2E8', surface: '#FFFCF6', surfaceSoft: '#F1E7D7', primary: '#264A3D', primarySoft: '#42685A', secondary: '#7A8B7F', accent: '#C76D4B', accentHover: '#B65B3B', sand: '#DFC9A8', text: '#2A2D2B', muted: '#77736B', border: '#E6DAC8', danger: '#B7483E', gradientFrom: '#F7F2E8', gradientTo: '#F1E7D7', scheme: 'light' },
  typography: { headingFamily: 'serif', bodyFamily: 'sans', bodySize: 16, lineHeight: 1.8, letterSpacing: 0, headingWeight: 700, paragraphSpacing: 1.2, headingStyle: 'plain' },
  shape: { cardRadius: 12, buttonRadius: 8, borderWidth: 1 },
  layout: { contentWidth: 1200, articleWidth: 760, sectionGap: 1, density: 'comfortable', homeLayout: 'editorial', journalLayout: 'single' },
  card: { style: 'border', opacity: 1, blur: 0 }, background: { style: 'solid', texture: 'none', intensity: 0.4, mediaId: null },
  motion: { level: 'subtle', hover: 'lift', entrance: true, scrollReveal: false },
  effects: { particles: 'none', grain: false, lightLeak: false, vignette: false }, map: { style: 'auto', routeColor: '#C76D4B', routeWidth: 3, markerStyle: 'dot', animateRoute: false },
  decorations: { corner: 'none', pageEdge: 'none', headerOrnament: 'none', opacity: 0.35 }, stickers: { density: 'none', items: [] },
  dividers: { style: 'line', glyph: 'none' }, ambient: { glow: 'none', drift: 'none', intensity: 0.4 },
  blockStyles: { callout: 'plain', quote: 'plain', timeline: 'line', stats: 'plain', locationCard: 'plain', journalMoment: 'classic' },
  interactions: { stickerClick: 'none', heroEntrance: 'none' }, hero: { mediaId: null, shape: 'none', overlay: 'none' },
}

const select = (key: string, label: string, options: [StudioScalar, string][], extra: Partial<SettingField> = {}): SettingField => ({ key, label, type: 'select', options, ...extra })
const number = (key: string, label: string, min: number, max: number, step: number, extra: Partial<SettingField> = {}): SettingField => ({ key, label, type: 'number', min, max, step, ...extra })
const toggle = (key: string, label: string, extra: Partial<SettingField> = {}): SettingField => ({ key, label, type: 'switch', ...extra })

export const settingGroups: SettingGroup[] = [
  { key: 'typography', label: '字体与排版', preview: 'journal', fields: [
    select('headingFamily', '标题字体', [['serif', '杂志衬线'], ['sans', '现代无衬线'], ['rounded', '圆润黑体'], ['mono', '等宽字体']]),
    select('bodyFamily', '正文字体', [['sans', '清晰无衬线'], ['serif', '沉浸衬线'], ['rounded', '圆润黑体'], ['mono', '等宽字体']]),
    select('headingStyle', '标题装饰', [['plain', '无装饰'], ['underline', '下划线'], ['bar', '左侧竖条'], ['serif-caps', '小型大写'], ['outline', '描边空心']]),
    number('bodySize', '正文字号', 14, 22, 1), number('lineHeight', '正文行高', 1.4, 2.4, .05), number('letterSpacing', '字间距 (em)', -.02, .24, .01), number('headingWeight', '标题字重', 400, 900, 50), number('paragraphSpacing', '段间距 (em)', .6, 2.4, .05),
  ]},
  { key: 'shape', label: '圆角与描边', preview: 'home', fields: [number('cardRadius', '卡片圆角', 0, 32, 1), number('buttonRadius', '按钮圆角', 0, 32, 1), number('borderWidth', '描边粗细', 0, 4, 1)] },
  { key: 'layout', label: '页面布局', preview: 'home', fields: [
    select('homeLayout', '首页布局', [['editorial', '旅行杂志'], ['classic', '整齐卡片'], ['bento', 'Bento 格'], ['magazine', '杂志栅格'], ['timeline', '时间轴'], ['masonry', '瀑布流']], { target: '首页整体版式' }),
    select('journalLayout', '日记布局', [['single', '标准单栏'], ['wide', '宽栏'], ['immersive', '沉浸式'], ['scrapbook', '手账式']], { preview: 'journal', target: '日记正文版式' }),
    select('density', '内容密度', [['compact', '紧凑'], ['comfortable', '舒适'], ['relaxed', '宽松']]), number('contentWidth', '内容宽度', 960, 1600, 20),
    number('articleWidth', '文章宽度', 600, 1000, 20, { preview: 'journal', target: '正文阅读区', help: '控制日记正文的最大阅读宽度' }), number('sectionGap', '区块间距倍数', .6, 2.2, .05),
  ]},
  { key: 'card', label: '卡片风格', preview: 'home', fields: [select('style', '卡片外观', [['flat', '无边无影'], ['border', '描边'], ['shadow', '投影'], ['glass', '玻璃拟态'], ['paper', '纸片'], ['polaroid', '拍立得'], ['film', '胶片']]), number('opacity', '卡片不透明度', .4, 1, .02), number('blur', '毛玻璃模糊', 0, 24, 1, { condition: d => d.card.style === 'glass', help: '选择「玻璃拟态」后可调整' })] },
  { key: 'background', label: '页面背景', preview: 'home', fields: [select('style', '背景类型', [['solid', '纯色'], ['gradient', '渐变'], ['image', '图片']]), select('texture', '叠加纹理', [['none', '无'], ['paper', '纸纹'], ['grain', '胶片颗粒'], ['noise', '噪点'], ['dots', '圆点'], ['grid', '网格'], ['topo', '等高线']]), number('intensity', '纹理强度', 0, 1, .05, { condition: d => d.background.texture !== 'none' || d.background.style === 'image' })] },
  { key: 'motion', label: '动效', preview: 'home', tier: 'advanced', fields: [select('level', '动效强度', [['none', '关闭'], ['subtle', '轻微'], ['standard', '标准'], ['strong', '强烈']]), select('hover', '悬停反馈', [['none', '无'], ['lift', '浮起'], ['zoom', '放大'], ['tilt', '倾斜']]), toggle('entrance', '进入动画'), toggle('scrollReveal', '滚动揭示')] },
  { key: 'effects', label: '页面特效', preview: 'home', tier: 'advanced', hint: '系统开启「减少动态效果」时自动失效', fields: [select('particles', '粒子效果', [['none', '关闭'], ['snow', '雪'], ['sakura', '樱花'], ['leaves', '落叶'], ['stars', '星空'], ['dust', '浮尘']]), toggle('grain', '胶片颗粒'), toggle('lightLeak', '漏光'), toggle('vignette', '暗角')] },
  { key: 'map', label: '地图视觉', preview: 'map', tier: 'advanced', fields: [select('style', '地图色调', [['auto', '跟随明暗'], ['light', '明亮'], ['dark', '暗色'], ['vintage', '复古'], ['terrain', '地形增强']]), select('markerStyle', '标记样式', [['dot', '圆点'], ['pin', '水滴'], ['ring', '圆环'], ['photo', '大圆点']]), { key: 'routeColor', label: '路线颜色', type: 'color' }, number('routeWidth', '路线粗细', 1, 8, 1), toggle('animateRoute', '路线绘制动画')] },
  { key: 'decorations', label: '页面装饰', preview: 'home', fields: [select('corner', '页面角落', [['none', '无'], ['vine', '藤蔓'], ['wave', '海浪'], ['leaf', '落叶'], ['frost', '霜花'], ['stamp', '邮戳'], ['compass', '指南针']]), select('pageEdge', '页边点缀', [['none', '无'], ['petal', '花瓣'], ['sun', '太阳'], ['leaf', '落叶'], ['snow', '雪花'], ['star', '星星']], { preview: 'journal' }), select('headerOrnament', '标题纹样', [['none', '无'], ['line', '短线'], ['compass', '指南针'], ['ticket', '车票'], ['arch', '拱形'], ['wave', '波浪']]), number('opacity', '装饰浓度', .05, 1, .05)] },
  { key: 'stickers', label: '主题贴纸', preview: 'journal', tier: 'advanced', fields: [select('density', '贴纸密度', [['none', '不显示'], ['low', '少量'], ['medium', '适中']])] },
  { key: 'dividers', label: '章节分隔线', preview: 'journal', tier: 'advanced', fields: [select('style', '线条样式', [['line', '细线'], ['dashed', '虚线'], ['dotted', '点线'], ['ornament', '两端渐隐'], ['wave', '波浪'], ['torn', '撕纸边']]), select('glyph', '中间符号', [['none', '无'], ['sakura', '🌸 樱花'], ['sun', '☀ 太阳'], ['leaf', '🍂 落叶'], ['snow', '❄ 雪花'], ['compass', '✧ 指南针'], ['plane', '✈ 飞机'], ['stamp', '❖ 邮戳'], ['wave', '〜 波浪'], ['star', '✦ 星星']])] },
  { key: 'ambient', label: '环境氛围', preview: 'home', tier: 'advanced', fields: [select('glow', '光晕', [['none', '无'], ['sun', '阳光'], ['moon', '月光'], ['lantern', '灯光'], ['dawn', '晨曦']]), select('drift', '缓慢移动层', [['none', '无'], ['clouds', '云'], ['mist', '薄雾'], ['fireflies', '萤火']]), number('intensity', '氛围强度', 0, 1, .05)] },
  { key: 'blockStyles', label: '内容块皮肤', preview: 'journal', tier: 'advanced', fields: [select('callout', '提示卡片', [['plain', '默认'], ['paper', '纸片'], ['tape', '胶带'], ['ticket', '票根'], ['frame', '双线框']]), select('quote', '引用', [['plain', '默认'], ['mark', '大引号'], ['card', '卡片'], ['handwritten', '手写感']]), select('timeline', '时间线', [['line', '竖线'], ['dots', '圆点'], ['stamps', '邮戳时间'], ['tickets', '车票时间']]), select('stats', '数字亮点', [['plain', '默认'], ['badge', '药丸'], ['ticket', '票根']]), select('locationCard', '地点卡片', [['plain', '默认'], ['postcard', '明信片'], ['label', '标签条'], ['passport', '护照页']]), select('journalMoment', '开场/章节/小结', [['classic', '默认'], ['spring', '春日花枝'], ['summer', '夏日阳光'], ['autumn', '秋日车票'], ['winter', '冬日霜花']])] },
  { key: 'interactions', label: '互动', preview: 'journal', tier: 'advanced', fields: [select('stickerClick', '点击贴纸', [['none', '无反应'], ['pop', '弹一下'], ['wiggle', '摇一摇'], ['drift', '飘走'], ['heart-pop', '心跳']]), select('heroEntrance', '封面入场', [['none', '无'], ['float', '上浮'], ['fade', '淡入'], ['drift', '横向滑入']], { preview: 'home' })] },
  { key: 'hero', label: '首页封面', preview: 'home', fields: [select('shape', '底边形状', [['none', '平直'], ['wave', '波浪'], ['arch', '拱形'], ['torn', '撕纸'], ['tape', '胶带']]), select('overlay', '叠加光', [['none', '无'], ['sun', '阳光'], ['frost', '霜白'], ['paper', '纸感'], ['dusk', '暮色']])] },
]

export const stickerAreas: [string, string][] = [['hero-left', '页眉左'], ['hero-right', '页眉右'], ['page-left', '页面左侧'], ['page-right', '页面右侧'], ['section-gap', '章节之间'], ['image-corner', '图片旁'], ['footer', '页脚']]
export const stickerAssets = [
  { group: '春', items: [['spring-sakura', '樱花'], ['spring-sprout', '嫩芽'], ['spring-bird', '小鸟'], ['spring-cloud', '云朵']] },
  { group: '夏', items: [['summer-sun', '太阳'], ['summer-wave', '海浪'], ['summer-drink', '冰饮'], ['summer-watermelon', '西瓜']] },
  { group: '秋', items: [['autumn-maple', '枫叶'], ['autumn-leaf', '落叶'], ['autumn-coffee', '咖啡'], ['autumn-ticket', '火车票']] },
  { group: '冬', items: [['winter-snowflake', '雪花'], ['winter-mug', '热咖啡'], ['winter-cabin', '小屋'], ['winter-pine', '松树']] },
  // 通用旅行贴纸，不属于任何一个季节。复古那一组（邮票、邮戳、飞机、护照）随主题在 V32 一起下线了
  { group: '通用', items: [['classic-compass', '指南针'], ['classic-pin', '地图针'], ['classic-tag', '行李牌']] },
] as { group: string, items: string[][] }[]
