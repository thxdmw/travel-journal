<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { render as renderJournal } from '@/journal/render'
import { enhance, teardown } from '@/media/enhance'
import JournalCard from '@/public/components/JournalCard.vue'
import {
  THEME_PREVIEW_HOME_JOURNALS,
  THEME_PREVIEW_JOURNAL_DOCUMENT,
  THEME_PREVIEW_ROUTE_POINTS,
} from '@/public/fixtures/theme-preview'
import { render as renderDayRoute, type DayRouteController } from '@/route/day-route'
import type { MapTokens } from '@/types/theme'
import type { TravelMapInstance } from '@/types/travel-map'

type PreviewScene = 'home' | 'journal' | 'map'

export interface ThemePreviewSceneDeps {
  createMap(element: HTMLElement | null, options: { provider: 'OSM', zoom: number, style?: string }): Promise<TravelMapInstance | null>
  destroyMap(element: HTMLElement | null): void
  mapTokens(): MapTokens
}

const props = defineProps<ThemePreviewSceneDeps>()
const requestedScene = new URLSearchParams(location.search).get('scene')
const scene: PreviewScene = requestedScene === 'journal' || requestedScene === 'map' ? requestedScene : 'home'
const journalArticle = ref<HTMLElement | null>(null)
const mapEl = ref<HTMLElement | null>(null)
const journalHtml = renderJournal(THEME_PREVIEW_JOURNAL_DOCUMENT, [])
let routeMap: TravelMapInstance | null = null
let routeControl: DayRouteController | null = null
let tornDown = false

function refreshMapTheme() {
  if (scene !== 'map') return
  const theme = props.mapTokens()
  routeMap?.setStyle(theme.style)
  routeControl?.refreshTheme()
}

function refreshJournalMedia() {
  if (scene !== 'journal' || !journalArticle.value) return
  teardown(journalArticle.value)
  enhance(journalArticle.value)
}

function refreshSceneTheme() {
  refreshMapTheme()
  refreshJournalMedia()
}

onMounted(async () => {
  window.addEventListener('travel-theme-applied', refreshSceneTheme)
  await nextTick()
  if (scene === 'journal') enhance(journalArticle.value)
  if (scene !== 'map') return
  const map = await props.createMap(mapEl.value, { provider: 'OSM', zoom: 8, style: props.mapTokens().style })
  if (tornDown || !map) {
    map?.destroy()
    return
  }
  routeMap = map
  routeControl = renderDayRoute(routeMap, THEME_PREVIEW_ROUTE_POINTS, { source: 'moment' })
})

onBeforeUnmount(() => {
  tornDown = true
  window.removeEventListener('travel-theme-applied', refreshSceneTheme)
  teardown(journalArticle.value)
  routeControl?.destroy()
  routeMap?.destroy()
  props.destroyMap(mapEl.value)
})
</script>

<template>
  <main v-if="scene === 'home'" class="home-page-shell theme-preview-scene" data-theme-preview-fixture="home">
    <section class="hero"><div class="hero-copy"><span class="hero-kicker">PERSONAL TRAVEL JOURNAL</span><h1>把走过的路，<br>写成自己的故事</h1><p>记录城市、光影和旅途中那些不愿忘记的时刻。这里没有攻略排名，只有属于自己的远方。</p><button class="primary-btn" type="button">浏览旅行日记</button></div><div class="hero-photo home-hero-photo" role="img" aria-label="示例封面"></div></section>
    <div class="page home-page">
      <section class="section"><div class="section-head"><h2 class="section-title">最近的旅行日记</h2><span class="text-link">查看全部 ›</span></div><div class="card-grid"><JournalCard v-for="item in THEME_PREVIEW_HOME_JOURNALS" :key="item.id" :item="item" /></div></section>
      <section class="section map-stats"><div class="map-panel"><h2 class="section-title" style="font-size: 21px; margin-bottom: 18px">我的足迹地图</h2><div class="map-box theme-preview-map-placeholder">地图场景请切到「地图」预览</div></div><div class="stats-panel"><h2 class="section-title" style="font-size: 21px; margin-bottom: 18px">旅行数据</h2><div class="stats-grid"><div class="stat"><strong>12</strong><span>去过的旅行</span></div><div class="stat"><strong>48</strong><span>旅行日记</span></div><div class="stat"><strong>26</strong><span>打卡城市</span></div><div class="stat"><strong>1,280</strong><span>旅行照片</span></div></div><p class="quote">"世界很大，而你的故事，值得被记录。"</p></div></section>
    </div>
  </main>
  <main v-else-if="scene === 'journal'" class="page article theme-preview-scene" data-theme-preview-fixture="journal">
    <header class="article-head"><div class="hero-kicker">示例旅行 · 成都</div><h1>都江堰与青城山的一天</h1><p class="article-excerpt">这是主题设计器的固定示例日记，用来展示日记正文里所有可主题化的内容块。</p><div class="article-meta">2026-08-10 · 约 4 分钟阅读</div></header>
    <!-- 固定 Blocks Fixture 经同一安全渲染器生成，用于完整展示所有正文主题落点。 -->
    <!-- eslint-disable-next-line vue/no-v-html -->
    <article ref="journalArticle" class="journal-document" v-html="journalHtml"></article>
  </main>
  <main v-else class="page theme-preview-scene" data-theme-preview-fixture="map">
    <div class="page-title"><span class="eyebrow">ROUTE PREVIEW</span><h1>示例路线</h1><p>成都 → 都江堰 → 青城山 → 成都，用来展示地图相关的主题设置。</p></div>
    <div class="map-panel"><div ref="mapEl" class="map-box" style="height: 520px"></div></div>
  </main>
</template>
