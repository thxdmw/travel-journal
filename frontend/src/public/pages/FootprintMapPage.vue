<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { publicApi } from '@/api/public'
import type { CityMarker } from '@/types/public'
import type { TravelMapInstance } from '@/types/travel-map'

interface MapRenderOptions {
  fit: boolean
  maxZoom: number
}

export interface FootprintMapPageDeps {
  mapProviderSwitch: Component
  createMap(
    element: HTMLElement | null,
    markers: CityMarker[],
    options: MapRenderOptions,
  ): Promise<TravelMapInstance | null>
  destroyMap(element: HTMLElement | null): void
}

const ALL = '全部'
const props = defineProps<FootprintMapPageDeps>()
const providerComponent = markRaw(props.mapProviderSwitch)
const mapEl = ref<HTMLElement | null>(null)
const cities = ref<CityMarker[]>([])
const country = ref(ALL)
const year = ref(ALL)
const trip = ref(ALL)
const journalOnly = ref(false)
let map: TravelMapInstance | null = null
let renderToken = 0

const countries = computed(() => [ALL, ...new Set(cities.value.map(item => item.countryName).filter(Boolean))])
const years = computed(() => [
  ALL,
  ...new Set(cities.value.flatMap(item => item.visitedYears ?? []).map(String)),
].sort((left, right) => left === ALL ? -1 : Number(right) - Number(left)))
const trips = computed(() => {
  const values = new Map<string, string>()
  cities.value.flatMap(item => item.trips ?? []).forEach(item => values.set(item.slug, item.title))
  return [{ slug: ALL, title: '全部旅行' }, ...Array.from(values, ([slug, title]) => ({ slug, title }))]
})
const filtered = computed(() => cities.value.filter(item => (
  (country.value === ALL || item.countryName === country.value)
  && (year.value === ALL || (item.visitedYears ?? []).includes(Number(year.value)))
  && (trip.value === ALL || (item.trips ?? []).some(itemTrip => itemTrip.slug === trip.value))
  && (!journalOnly.value || item.publishedJournalCount > 0)
)))

async function renderMap() {
  const token = ++renderToken
  await nextTick()
  map?.destroy()
  map = null
  const created = await props.createMap(mapEl.value, filtered.value, { fit: true, maxZoom: 7 })
  if (token !== renderToken || !mapEl.value?.isConnected) created?.destroy()
  else map = created
}

watch([country, year, trip, journalOnly], renderMap)

onMounted(async () => {
  cities.value = await publicApi.cities()
  await renderMap()
})

onBeforeUnmount(() => {
  renderToken++
  map?.destroy()
  props.destroyMap(mapEl.value)
})
</script>

<template>
  <main class="page">
    <div class="page-title">
      <span class="eyebrow">MY FOOTPRINTS</span>
      <h1>足迹地图</h1>
      <p>每一个坐标，都连接着一段已经发生的故事。</p>
    </div>
    <div class="map-filter-bar">
      <select v-model="country" aria-label="按国家筛选">
        <option v-for="item in countries" :key="item" :value="item">{{ item === ALL ? '全部国家' : item }}</option>
      </select>
      <select v-model="year" aria-label="按年份筛选">
        <option v-for="item in years" :key="item" :value="item">{{ item === ALL ? '全部年份' : item + ' 年' }}</option>
      </select>
      <select v-model="trip" aria-label="按旅行筛选">
        <option v-for="item in trips" :key="item.slug" :value="item.slug">{{ item.title }}</option>
      </select>
      <label><input v-model="journalOnly" type="checkbox"> 仅看有日记的城市</label>
      <span>{{ filtered.length }} 个地点</span>
    </div>
    <div class="map-panel">
      <component :is="providerComponent" @change="renderMap" />
      <div ref="mapEl" class="map-box" style="height: 620px"></div>
    </div>
    <section class="section">
      <div class="card-grid">
        <div v-for="city in filtered" :key="city.countryName + city.cityName" class="journal-card">
          <div class="card-body">
            <h3>{{ city.cityName }} · {{ city.countryName }}</h3>
            <p>{{ city.tripCount }} 次旅行，{{ city.publishedJournalCount }} 篇日记</p>
            <div class="card-meta"><span>{{ city.firstVisitedOn || '日期未记录' }}</span></div>
          </div>
        </div>
      </div>
      <div v-if="!filtered.length" class="empty">当前筛选条件下没有足迹。</div>
    </section>
  </main>
</template>
