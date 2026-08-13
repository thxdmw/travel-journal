<script setup lang="ts">
import { markRaw, nextTick, onBeforeUnmount, onMounted, ref, type Component } from 'vue'
import { publicApi } from '@/api/public'
import { useRoute } from '@/vendor/vue-router-global'
import type { TripDetail, TripStopView } from '@/types/public'
import type { ThemeView } from '@/types/theme'
import type { TravelMapInstance } from '@/types/travel-map'

export interface TripDetailPageDeps {
  mapProviderSwitch: Component
  createMap(
    element: HTMLElement | null,
    markers: TripStopView[],
    options: { fit: boolean; route: boolean; maxZoom: number },
  ): Promise<TravelMapInstance | null>
  destroyMap(element: HTMLElement | null): void
  setScopedTheme(theme: ThemeView | null): void
  clearScopedTheme(): void
}

const props = defineProps<TripDetailPageDeps>()
const providerComponent = markRaw(props.mapProviderSwitch)
const route = useRoute()
const data = ref<TripDetail | null>(null)
const mapEl = ref<HTMLElement | null>(null)
let map: TravelMapInstance | null = null
let mapToken = 0

function routeSlug(): string {
  const value = route.params.slug
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

async function renderMap() {
  if (!data.value) return
  const token = ++mapToken
  map?.destroy()
  map = null
  const created = await props.createMap(mapEl.value, data.value.stops, {
    fit: true,
    route: true,
    maxZoom: 10,
  })
  if (token !== mapToken || !mapEl.value?.isConnected) created?.destroy()
  else map = created
}

onMounted(async () => {
  data.value = await publicApi.trip(routeSlug())
  props.setScopedTheme(data.value.theme)
  await nextTick()
  await renderMap()
})

onBeforeUnmount(() => {
  mapToken++
  map?.destroy()
  props.destroyMap(mapEl.value)
  props.clearScopedTheme()
})
</script>

<template>
  <main v-if="data" class="page">
    <section class="trip-banner">
      <div class="trip-banner-copy">
        <small>{{ data.trip.startDate }} — {{ data.trip.endDate }}</small>
        <h1>{{ data.trip.title }}</h1>
        <p>{{ data.trip.summary }}</p>
        <div>{{ data.trip.cities.join(' · ') }}</div>
      </div>
      <img v-if="data.trip.coverUrl" class="trip-banner-photo" :src="data.trip.coverUrl" :alt="data.trip.title">
      <div v-else class="hero-placeholder">旅行的章节</div>
    </section>
    <section class="section map-stats">
      <div>
        <div class="section-head"><h2 class="section-title">旅行时间线</h2></div>
        <div class="timeline">
          <router-link
            v-for="item in data.journals"
            :key="item.id"
            class="timeline-item"
            :to="`/journals/${item.slug}`"
          >
            <small>{{ item.occurredOn }} · {{ item.cityName || data.trip.title }}</small>
            <h3>{{ item.title }}</h3>
            <p>{{ item.excerpt }}</p>
          </router-link>
        </div>
      </div>
      <div class="map-panel">
        <h2 class="section-title" style="font-size: 21px; margin-bottom: 18px">城市足迹</h2>
        <component :is="providerComponent" @change="renderMap" />
        <div ref="mapEl" class="map-box"></div>
      </div>
    </section>
  </main>
  <div v-else class="loading">正在读取旅行记录…</div>
</template>
