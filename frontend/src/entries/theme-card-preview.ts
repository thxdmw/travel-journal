import '@/styles/themes/travel-classic.css'
import '@/styles/theme-tokens.css'
import '@/styles/public.css'
import '@/styles/journal-blocks.css'
import '@/styles/theme-pack.css'
import '@/styles/theme-card-preview.css'
import { render } from '@/journal/render'
import { apply, current } from '@/theme/theme'
import { install as installThemeEffects, sync as syncThemeEffects } from '@/effects/runtime'
import type { ThemeInput } from '@/types/theme'

const demo = {
  schemaVersion: 1,
  blocks: [
    { id: 'demo_opener', type: 'day-opener', version: 1, title: '', data: { city: '京都', dayLabel: 'Day 3', date: '2026-08-11', weather: '晴', route: ['清水寺', '鸭川'], metrics: [] }, settings: {} },
    { id: 'demo_chapter', type: 'chapter', version: 1, title: '', data: { time: '16:20', title: '风吹过河岸', note: '慢慢走' }, settings: {} },
    { id: 'demo_text', type: 'paragraph', version: 1, title: '', data: { text: '把今天的光和风，都留在这一页。' }, settings: { style: 'normal', align: 'left' } },
    { id: 'demo_image', type: 'image', version: 1, title: '', data: { mediaId: 1, caption: '' }, settings: { size: 'medium', align: 'center', frame: '', tone: '' } },
    { id: 'demo_summary', type: 'day-summary', version: 1, title: '', data: { items: [{ icon: '☀', label: '今日天气', value: '晴朗' }, { icon: '↟', label: '走过', value: '12 km' }] }, settings: {} },
  ],
}
const media = [{ id: 1, thumbnailUrl: '/img/home-hero-kyoto.png', mediumUrl: '/img/home-hero-kyoto.png', displayUrl: '/img/home-hero-kyoto.png' }]
const root = document.querySelector<HTMLElement>('#demo')
if (!root) throw new Error('主题卡片预览缺少 #demo 根节点')
root.innerHTML = render(demo, media)

function applyPreview(theme: ThemeInput): void {
  apply(theme, { persist: false })
  document.documentElement.dataset.effectsParticles = 'none'
  document.documentElement.dataset.motionScrollReveal = 'off'
  syncThemeEffects()
}

applyPreview('travel-classic')
installThemeEffects({ currentDefinition: () => current()?.definitionJson })

window.addEventListener('message', event => {
  if (event.origin !== location.origin || typeof event.data !== 'object' || event.data === null) return
  const data = event.data as { type?: unknown; theme?: unknown }
  if (data.type !== 'travel-theme-preview' || data.theme == null) return
  applyPreview(data.theme as ThemeInput)
})
