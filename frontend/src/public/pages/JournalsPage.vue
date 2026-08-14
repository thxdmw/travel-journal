<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { publicApi } from '@/api/public'
import JournalCard from '@/public/components/JournalCard.vue'
import { useRoute, useRouter, type LocationQueryValue } from 'vue-router'
import type { PageResponse } from '@/types/common'
import type { JournalCard as JournalCardView, TagView } from '@/types/journal'

const route = useRoute()
const router = useRouter()
const data = ref<PageResponse<JournalCardView> | null>(null)
const tags = ref<TagView[]>([])
const loading = ref(false)

function queryText(value: LocationQueryValue | LocationQueryValue[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

const keyword = ref(queryText(route.query.q))
const activeTag = computed(() => queryText(route.query.tag))
const PAGE_SIZE = 12
/*
 * 页码走地址栏。
 *
 * 这一页以前永远只请求第一页 12 条，也没有任何翻页入口：写到第 13 篇，前面那些
 * 就再也点不到了。页码放进 query 而不是组件状态，浏览器的前进后退才回得到原来那一页。
 */
const page = computed(() => {
  const value = Number(queryText(route.query.page))
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1
})
const totalPages = computed(() => data.value?.totalPages ?? 0)

async function load() {
  loading.value = true
  try {
    data.value = await publicApi.journals(
      page.value,
      PAGE_SIZE,
      queryText(route.query.q) || undefined,
      activeTag.value || undefined,
    )
  } catch {
    data.value = { items: [], page: page.value, pageSize: PAGE_SIZE, total: 0, totalPages: 0 }
  } finally {
    loading.value = false
  }
}

/** 换筛选条件时不带页码：新的结果集里第 3 页可能根本不存在。 */
function currentQuery(): Record<string, string> {
  const query: Record<string, string> = {}
  if (keyword.value.trim()) query.q = keyword.value.trim()
  if (activeTag.value) query.tag = activeTag.value
  return query
}

function search() {
  void router.push({ path: '/journals', query: currentQuery() })
}

function goToPage(next: number) {
  if (next < 1 || (totalPages.value && next > totalPages.value)) return
  const query = currentQuery()
  if (next > 1) query.page = String(next)
  void router.push({ path: '/journals', query })
}

function pickTag(slug: string) {
  const query = currentQuery()
  if (slug === activeTag.value) delete query.tag
  else query.tag = slug
  void router.push({ path: '/journals', query })
}

function reset() {
  keyword.value = ''
  void router.push({ path: '/journals' })
}

watch(() => route.query, () => {
  keyword.value = queryText(route.query.q)
  void load()
})

onMounted(async () => {
  await load()
  try {
    tags.value = await publicApi.tags()
  } catch {
    tags.value = []
  }
})
</script>

<template>
  <main class="page">
    <div class="page-title">
      <span class="eyebrow">STORIES ON THE ROAD</span>
      <h1>旅行日记</h1>
      <p>风景会远去，文字让当时的心情重新回来。</p>
    </div>
    <div class="journal-filters">
      <div class="search-box">
        <input v-model="keyword" type="search" placeholder="搜索标题、摘要或正文…" @keyup.enter="search">
        <button type="button" @click="search">搜索</button>
      </div>
      <div v-if="tags.length" class="tag-cloud">
        <button
          v-for="tag in tags"
          :key="tag.slug"
          type="button"
          class="tag-chip"
          :class="{ active: activeTag === tag.slug }"
          @click="pickTag(tag.slug)"
        >
          {{ tag.name }}<i>{{ tag.journalCount }}</i>
        </button>
      </div>
    </div>
    <div v-if="loading" class="empty">正在查找…</div>
    <div v-else-if="data?.items.length" class="card-grid">
      <JournalCard v-for="item in data.items" :key="item.id" :item="item" />
    </div>
    <div v-else class="empty">
      没有找到匹配的日记。<button type="button" class="text-link-btn" @click="reset">清空筛选</button>
    </div>
    <nav v-if="!loading && totalPages > 1" class="journal-pager" aria-label="日记分页">
      <button type="button" :disabled="page <= 1" @click="goToPage(page - 1)">上一页</button>
      <span>第 {{ page }} / {{ totalPages }} 页</span>
      <button type="button" :disabled="page >= totalPages" @click="goToPage(page + 1)">下一页</button>
    </nav>
  </main>
</template>
