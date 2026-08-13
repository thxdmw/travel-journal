<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { useRoute } from 'vue-router'
import { publicApi } from '@/api/public'
import { wordCount } from '@/journal/document'
import { render as renderJournal } from '@/journal/render'
import { enhance, teardown } from '@/media/enhance'
import { groupOf, MEDIA_SELECTOR } from '@/media/selector'
import { render as renderDayRoute, type DayRouteController } from '@/route/day-route'
import type { JournalDetail } from '@/types/journal'
import type { RoutePoint } from '@/types/moment'
import type { ThemeView } from '@/types/theme'
import type { TravelMapInstance } from '@/types/travel-map'

interface LightboxItem {
  src: string
  caption: string
}

interface LightboxState {
  items: LightboxItem[]
  index: number
}

export interface JournalDetailPageDeps {
  preview?: boolean
  mapProviderSwitch: Component
  createMap(
    element: HTMLElement | null,
    markers: readonly [],
    options: Record<string, never>,
  ): Promise<TravelMapInstance | null>
  destroyMap(element: HTMLElement | null): void
  setScopedTheme(theme: ThemeView | null): void
  clearScopedTheme(): void
}

const SCALES = [0.88, 1, 1.14, 1.3] as const
const SCALE_LABELS = ['小', '标准', '大', '特大'] as const
const props = withDefaults(defineProps<JournalDetailPageDeps>(), { preview: false })
const providerComponent = markRaw(props.mapProviderSwitch)
const route = useRoute()
const data = ref<JournalDetail | null>(null)
const previewFailed = ref(false)
const article = ref<HTMLElement | null>(null)
const lightbox = ref<LightboxState | null>(null)
const progress = ref(0)
const routeEl = ref<HTMLElement | null>(null)
const replaying = ref(false)
const replayIndex = ref(-1)
let routeMap: TravelMapInstance | null = null
let routeControl: DayRouteController | null = null
let routeTornDown = false

const html = computed(() => data.value ? renderJournal(data.value.contentJson, data.value.media) : '')
const readingMinutes = computed(() => Math.max(1, Math.ceil(wordCount(data.value?.contentJson) / 500)))
const current = computed(() => lightbox.value?.items[lightbox.value.index] ?? null)
const routePoints = computed<RoutePoint[]>(() => data.value?.route ?? [])
const routeIsReal = computed(() => routePoints.value[0]?.source === 'moment')
const routeTitle = computed(() => routeIsReal.value ? '这一天走过的路' : '这一天的安排')
const replayLabel = computed(() => replaying.value ? '停止回放' : (routeIsReal.value ? '▶ 回放这一天' : '▶ 依次看一遍'))
const initialScale = Number(localStorage.getItem('travel-journal.reading-scale')) || 1
const scaleIndex = ref(Math.min(SCALES.length - 1, Math.max(0, initialScale)))
const scaleLabel = computed(() => SCALE_LABELS[scaleIndex.value])

function routeParam(name: string): string {
  const value = route.params[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

function openLightbox(items: LightboxItem[], index: number) {
  lightbox.value = { items, index: Math.max(0, index) }
}

function openArticleImage(event: MouseEvent) {
  if (!(event.target instanceof HTMLImageElement) || !event.target.matches(MEDIA_SELECTOR)) return
  const group = groupOf(event.target)
  openLightbox(group.map(image => ({ src: image.src, caption: image.alt || '' })), group.indexOf(event.target))
}

function stepLightbox(delta: number) {
  if (!lightbox.value) return
  const total = lightbox.value.items.length
  lightbox.value.index = (lightbox.value.index + delta + total) % total
}

function onKeydown(event: KeyboardEvent) {
  if (!lightbox.value) return
  if (event.key === 'Escape') lightbox.value = null
  else if (event.key === 'ArrowLeft') stepLightbox(-1)
  else if (event.key === 'ArrowRight') stepLightbox(1)
}

function updateProgress() {
  const height = document.documentElement.scrollHeight - window.innerHeight
  progress.value = height > 0 ? Math.min(100, Math.max(0, window.scrollY / height * 100)) : 0
}

async function setupRoute() {
  if (!routePoints.value.length || !routeEl.value || routeMap) return
  const map = await props.createMap(routeEl.value, [], {})
  if (routeTornDown || !map) {
    map?.destroy()
    return
  }
  routeMap = map
  routeControl = renderDayRoute(routeMap, routePoints.value, {
    source: routePoints.value[0]?.source ?? undefined,
    onState: state => {
      replaying.value = state.playing
      replayIndex.value = state.index
    },
  })
}

function toggleReplay() {
  routeControl?.play()
}

function teardownRoute() {
  routeTornDown = true
  routeControl?.destroy()
  routeControl = null
  routeMap?.destroy()
  routeMap = null
  props.destroyMap(routeEl.value)
}

function restartRoute() {
  teardownRoute()
  routeTornDown = false
  void setupRoute()
}

function applyScale() {
  document.documentElement.style.setProperty('--reading-scale', String(SCALES[scaleIndex.value]))
}

function stepScale(delta: number) {
  scaleIndex.value = Math.min(SCALES.length - 1, Math.max(0, scaleIndex.value + delta))
  localStorage.setItem('travel-journal.reading-scale', String(scaleIndex.value))
  applyScale()
}

applyScale()
watch(html, () => nextTick(() => {
  teardown(article.value)
  enhance(article.value)
}))

onMounted(async () => {
  try {
    data.value = props.preview
      ? await publicApi.preview(routeParam('token'))
      : await publicApi.journal(routeParam('slug'))
  } catch {
    previewFailed.value = true
    return
  }
  props.setScopedTheme(data.value.theme)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('scroll', updateProgress, { passive: true })
  await nextTick()
  updateProgress()
  enhance(article.value)
  await setupRoute()
})

onBeforeUnmount(() => {
  teardown(article.value)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', updateProgress)
  teardownRoute()
  props.clearScopedTheme()
})
</script>

<template>
  <main v-if="data" class="page article">
    <div class="reading-progress" aria-hidden="true"><span :style="{ width: progress + '%' }"></span></div>
    <div v-if="preview" class="preview-banner">草稿预览 · 这篇日记尚未发布，链接会过期</div>
    <header class="article-head">
      <div class="hero-kicker">
        {{ data.journal.tripTitle || '独立日记' }}<template v-if="data.journal.cityName"> · {{ data.journal.cityName }}</template>
      </div>
      <h1>{{ data.journal.title }}</h1>
      <p v-if="data.journal.excerpt" class="article-excerpt">{{ data.journal.excerpt }}</p>
      <div class="article-meta">{{ data.journal.occurredOn }} · 约 {{ readingMinutes }} 分钟阅读</div>
      <div class="reading-scale">
        <button type="button" aria-label="减小正文字号" :disabled="scaleIndex === 0" @click="stepScale(-1)">A−</button>
        <span>{{ scaleLabel }}</span>
        <button type="button" aria-label="增大正文字号" :disabled="scaleIndex === SCALES.length - 1" @click="stepScale(1)">A+</button>
      </div>
    </header>
    <!-- Blocks JSON 是正文唯一数据源，html 已由 journal/render 的白名单渲染器转义。 -->
    <!-- eslint-disable-next-line vue/no-v-html -->
    <article ref="article" class="journal-document" @click="openArticleImage" v-html="html"></article>
    <section v-if="routePoints.length" class="day-route">
      <header>
        <h2>{{ routeTitle }}</h2>
        <p v-if="!routeIsReal" class="day-route-hint">这条线来自当天的行程安排，不是实际走过的轨迹。</p>
        <button type="button" class="day-route-play" :class="{ playing: replaying }" @click="toggleReplay">{{ replayLabel }}</button>
      </header>
      <component :is="providerComponent" @change="restartRoute" />
      <div ref="routeEl" class="day-route-map"></div>
      <ol class="day-route-list">
        <li v-for="(point, index) in routePoints" :key="point.order" :class="{ 'is-active': replayIndex === index }">
          <time>{{ point.time || '—' }}</time><strong>{{ point.title }}</strong><span v-if="point.note">{{ point.note }}</span>
        </li>
      </ol>
    </section>
    <nav class="article-nav">
      <router-link v-if="data.previousSlug" :to="'/journals/' + data.previousSlug">← 上一篇</router-link><span v-else></span>
      <router-link v-if="data.nextSlug" :to="'/journals/' + data.nextSlug">下一篇 →</router-link>
    </nav>
    <teleport to="body">
      <div v-if="lightbox && current" class="photo-lightbox" role="dialog" aria-modal="true" @click.self="lightbox = null">
        <button type="button" class="lightbox-close" aria-label="关闭大图" @click="lightbox = null">×</button>
        <button v-if="lightbox.items.length > 1" type="button" class="lightbox-step lightbox-step--prev" aria-label="上一张" @click.stop="stepLightbox(-1)">‹</button>
        <button v-if="lightbox.items.length > 1" type="button" class="lightbox-step lightbox-step--next" aria-label="下一张" @click.stop="stepLightbox(1)">›</button>
        <figure @click.stop><img :src="current.src" :alt="current.caption || '旅行照片'"><figcaption v-if="current.caption">{{ current.caption }}</figcaption></figure>
        <span v-if="lightbox.items.length > 1" class="lightbox-count">{{ lightbox.index + 1 }} / {{ lightbox.items.length }}</span>
      </div>
    </teleport>
  </main>
  <div v-else-if="previewFailed" class="loading">{{ preview ? '预览链接无效或已过期。' : '日记加载失败，请稍后重试。' }}</div>
  <div v-else class="loading">正在展开日记…</div>
</template>
