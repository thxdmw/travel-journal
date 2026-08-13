<script setup lang="ts">
import { markRaw, nextTick, onBeforeUnmount, onMounted, ref, type Component } from 'vue'
import { publicApi } from '@/api/public'
import JournalCard from '@/public/components/JournalCard.vue'
import type { CityMarker, HomeView } from '@/types/public'
import type { TravelMapInstance } from '@/types/travel-map'

export interface HomePageDeps {
  mapProviderSwitch: Component
  createMap(
    element: HTMLElement | null,
    markers: CityMarker[],
    options: boolean,
  ): Promise<TravelMapInstance | null>
  destroyMap(element: HTMLElement | null): void
}

const props = defineProps<HomePageDeps>()
const providerComponent = markRaw(props.mapProviderSwitch)
const data = ref<HomeView | null>(null)
const mapEl = ref<HTMLElement | null>(null)
let map: TravelMapInstance | null = null
let mapToken = 0

async function renderMap() {
  if (!data.value) return
  const token = ++mapToken
  map?.destroy()
  map = null
  const created = await props.createMap(mapEl.value, data.value.cityMarkers, true)
  if (token !== mapToken || !mapEl.value?.isConnected) created?.destroy()
  else map = created
}

onMounted(async () => {
  data.value = await publicApi.home()
  await nextTick()
  await renderMap()
})

onBeforeUnmount(() => {
  mapToken++
  map?.destroy()
  props.destroyMap(mapEl.value)
})
</script>

<template>
  <main v-if="data" class="home-page-shell">
    <section class="hero">
      <div class="hero-copy">
        <span class="hero-kicker">PERSONAL TRAVEL JOURNAL</span>
        <h1>把走过的路，<br>写成自己的故事</h1>
        <p>记录城市、光影和旅途中那些不愿忘记的时刻。这里没有攻略排名，只有属于自己的远方。</p>
        <router-link class="primary-btn" to="/trips">浏览旅行日记</router-link>
      </div>
      <div class="hero-photo home-hero-photo" role="img" aria-label="京都春日老街与五重塔"></div>
    </section>
    <div class="page home-page">
      <section class="section">
        <div class="section-head">
          <h2 class="section-title">最近的旅行日记</h2>
          <router-link class="text-link" to="/journals">查看全部 ›</router-link>
        </div>
        <div v-if="data.recentJournals.length" class="card-grid">
          <JournalCard v-for="item in data.recentJournals.slice(0, 3)" :key="item.id" :item="item" />
        </div>
        <div v-else class="empty">第一篇旅行日记，正在等待被写下。</div>
      </section>
      <section class="section map-stats">
        <div class="map-panel">
          <h2 class="section-title" style="font-size: 21px; margin-bottom: 18px">我的足迹地图</h2>
          <component :is="providerComponent" @change="renderMap" />
          <div ref="mapEl" class="map-box"></div>
        </div>
        <div class="stats-panel">
          <h2 class="section-title" style="font-size: 21px; margin-bottom: 18px">旅行数据</h2>
          <div class="stats-grid">
            <div class="stat"><strong>{{ data.tripCount }}</strong><span>去过的旅行</span></div>
            <div class="stat"><strong>{{ data.journalCount }}</strong><span>旅行日记</span></div>
            <div class="stat"><strong>{{ data.cityCount }}</strong><span>打卡城市</span></div>
            <div class="stat"><strong>{{ data.photoCount }}</strong><span>旅行照片</span></div>
          </div>
          <p class="quote">“世界很大，而你的故事，值得被记录。”</p>
        </div>
      </section>
    </div>
  </main>
  <div v-else class="loading">正在翻开旅行手记…</div>
</template>
