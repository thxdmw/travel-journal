<script setup lang="ts">
import type { JournalCard } from '@/types/journal'

defineProps<{ item: JournalCard }>()

function coverSrcset(url: string | null): string | undefined {
  if (!url) return undefined
  const base = url.replace(/\/display$/, '')
  if (base === url) return undefined
  return `${base}/thumbnail 480w, ${base}/medium 768w, ${url} 1280w`
}
</script>

<template>
  <router-link class="journal-card" :to="`/journals/${item.slug}`">
    <img
      v-if="item.coverUrl"
      class="card-photo"
      :src="item.coverUrl"
      :srcset="coverSrcset(item.coverUrl)"
      sizes="(max-width: 700px) 92vw, (max-width: 1100px) 46vw, 31vw"
      loading="lazy"
      decoding="async"
      :alt="item.title"
    >
    <div v-else class="card-photo placeholder">远行手记</div>
    <div class="card-body">
      <h3>{{ item.title }}</h3>
      <p>{{ item.excerpt || '这段旅程，值得慢慢写下来。' }}</p>
      <div class="card-meta">
        <span>◷ {{ item.occurredOn }}</span>
        <span v-if="item.cityName || item.tripTitle">⌖ {{ item.cityName || item.tripTitle }}</span>
        <span v-else>✎ 独立日记</span>
      </div>
    </div>
  </router-link>
</template>
