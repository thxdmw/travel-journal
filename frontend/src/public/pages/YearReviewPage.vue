<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { publicApi } from '@/api/public'
import { useRoute, useRouter } from '@/vendor/vue-router-global'
import type { YearReview } from '@/types/public'

const route = useRoute()
const router = useRouter()
const years = ref<number[]>([])
const data = ref<YearReview | null>(null)
const loading = ref(true)

const current = computed(() => {
  const value = route.params.year
  return Number(Array.isArray(value) ? value[0] : value) || years.value[0]
})

async function load() {
  if (!current.value) {
    loading.value = false
    data.value = null
    return
  }
  loading.value = true
  try {
    data.value = await publicApi.yearReview(current.value)
  } catch {
    data.value = null
  } finally {
    loading.value = false
  }
}

function go(year: number) {
  void router.push(`/years/${year}`)
}

watch(() => route.params.year, () => void load())

onMounted(async () => {
  try {
    years.value = await publicApi.years()
  } catch {
    years.value = []
  }
  if (!route.params.year && years.value.length) {
    void router.replace(`/years/${years.value[0]}`)
    return
  }
  await load()
})
</script>

<template>
  <main class="page year-review">
    <div class="page-title">
      <span class="eyebrow">YEAR IN REVIEW</span>
      <h1>{{ current || '' }} 年回顾</h1>
      <p>这一年走过的路，和留下的文字。</p>
    </div>
    <div v-if="years.length > 1" class="year-switch">
      <button
        v-for="year in years"
        :key="year"
        type="button"
        :class="{ active: year === current }"
        @click="go(year)"
      >
        {{ year }}
      </button>
    </div>
    <div v-if="loading" class="empty">正在统计…</div>
    <template v-else-if="data && data.journalCount">
      <div class="review-grid">
        <div class="review-stat"><strong>{{ data.tripCount }}</strong><span>次旅行</span></div>
        <div class="review-stat"><strong>{{ data.cityCount }}</strong><span>座城市</span></div>
        <div class="review-stat"><strong>{{ data.countryCount }}</strong><span>个国家</span></div>
        <div class="review-stat"><strong>{{ data.distanceKm.toLocaleString() }}</strong><span>公里</span></div>
        <div class="review-stat"><strong>{{ data.journalCount }}</strong><span>篇日记</span></div>
        <div class="review-stat"><strong>{{ data.photoCount }}</strong><span>张照片</span></div>
      </div>
      <p v-if="data.farthestCity" class="review-note">
        今年走得最远的地方是 <strong>{{ data.farthestCity }}</strong>，最长的一次旅行持续了 {{ data.longestTripDays }} 天。
      </p>
      <div v-if="data.trips.length" class="section">
        <h2 class="section-title">这一年的旅行</h2>
        <ul class="review-trips">
          <li v-for="trip in data.trips" :key="trip.slug">
            <router-link :to="`/trips/${trip.slug}`">{{ trip.title }}</router-link>
            <span>{{ trip.startDate }} — {{ trip.endDate }} · {{ trip.cityCount }} 座城市 · {{ trip.journalCount }} 篇日记</span>
          </li>
        </ul>
      </div>
    </template>
    <div v-else class="empty">{{ current || '这' }} 年还没有公开的日记。</div>
  </main>
</template>
