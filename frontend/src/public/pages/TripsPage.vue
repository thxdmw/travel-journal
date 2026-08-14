<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { publicApi } from '@/api/public'
import type { TripCard } from '@/types/public'

const items = ref<TripCard[]>([])
const year = ref('全部')

const years = computed(() => [
  '全部',
  ...new Set(items.value.map(item => String(item.startDate).slice(0, 4))),
])
const filtered = computed(() =>
  year.value === '全部'
    ? items.value
    : items.value.filter(item => String(item.startDate).startsWith(year.value)),
)

onMounted(async () => {
  items.value = await publicApi.trips()
})
</script>

<template>
  <main class="page">
    <div class="page-title">
      <span class="eyebrow">TRAVEL ARCHIVE</span>
      <h1>旅行</h1>
      <p>按照时间整理走过的城市，每一次出发都留下独一无二的章节。</p>
    </div>
    <div class="filter-row">
      <button
        v-for="item in years"
        :key="item"
        class="chip"
        :class="{ active: year === item }"
        @click="year = item"
      >
        {{ item }}
      </button>
    </div>
    <div v-if="filtered.length" class="card-grid">
      <router-link
        v-for="trip in filtered"
        :key="trip.id"
        class="journal-card"
        :to="`/trips/${trip.slug}`"
      >
        <img v-if="trip.coverUrl" class="card-photo" :src="trip.coverUrl" loading="lazy" decoding="async" :alt="trip.title">
        <div v-else class="card-photo placeholder">{{ trip.cities[0] || '旅行' }}</div>
        <div class="card-body">
          <h3>{{ trip.title }}</h3>
          <p>{{ trip.summary || trip.cities.join(' · ') }}</p>
          <div class="card-meta">
            <span>{{ trip.startDate }} — {{ trip.endDate }}</span>
            <span>{{ trip.journalCount }} 篇</span>
          </div>
        </div>
      </router-link>
    </div>
    <div v-else class="empty">还没有公开的旅行。</div>
  </main>
</template>
