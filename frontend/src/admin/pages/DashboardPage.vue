<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { dashboardApi } from '@/api/dashboard'
import { useRouter } from 'vue-router'
import type { JournalStatus } from '@/types/journal'
import type { RecentJournal } from '@/types/dashboard'

const props = defineProps<{ fail(error: unknown): void }>()
const router = useRouter()
/*
 * 首屏是空的，数据要等一次网络往返。
 *
 * 不标记加载状态的话，四个指标会先以 0 渲染出来，几百毫秒后突然跳成真实数字——
 * 看着像「刚才统计错了」。骨架屏占的是同样的位置和高度，数据到了只是替换内容，
 * 版面不动。
 */
const loading = ref(true)
const stats = reactive<{ trips: number, drafts: number, published: number, themeName: string, recent: RecentJournal[] }>({
  trips: 0,
  drafts: 0,
  published: 0,
  themeName: '—',
  recent: [],
})

/** 四个指标共用一套骨架屏和排版，逐个写会把同一段模板抄四遍。 */
const metrics = computed(() => [
  { label: '旅行总数', value: stats.trips, wide: false },
  { label: '草稿日记', value: stats.drafts, wide: false },
  { label: '已发布日记', value: stats.published, wide: false },
  // 主题名是文字不是数字，用小一号字避免长名字撑破卡片
  { label: '当前主题', value: stats.themeName, wide: true },
])

function statusLabel(status: JournalStatus): string {
  return status === 'DRAFT' ? '草稿' : '已发布'
}

/** 日记可以不属于任何旅行，那不是缺数据，是一种正常归属。 */
function tripLabel(row: RecentJournal): string {
  return row.tripTitle || '独立日记'
}

function titleLabel(row: RecentJournal): string {
  return row.title || '未命名日记'
}

onMounted(async () => {
  try {
    // 统计全部由数据库聚合：以前是拉前 100 条日记在前端 filter，第 101 篇开始就不准了
    Object.assign(stats, await dashboardApi.overview())
  } catch (error) {
    props.fail(error)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <div class="page-head">
      <div><h2>管理首页</h2><p>整理旅行计划，也记录旅途之后的故事。</p></div>
      <el-button type="primary" @click="router.push('/trips')">管理旅行</el-button>
    </div>
    <div class="dashboard-grid">
      <div
        v-for="metric in metrics"
        :key="metric.label"
        class="metric">
        <span>{{ metric.label }}</span>
        <el-skeleton v-if="loading" :rows="0" animated><template #template><el-skeleton-item variant="h3" class="metric-skeleton" /></template></el-skeleton>
        <strong v-else :style="metric.wide ? 'font-size: 20px' : undefined">{{ metric.value }}</strong>
      </div>
    </div>
    <div class="panel panel-pad">
      <div class="page-head">
        <h3 style="color: var(--tj-primary); font-family: var(--tj-serif)">最近编辑</h3>
        <el-button link type="primary" @click="router.push('/journals')">全部日记</el-button>
      </div>
      <!--
        最近编辑改成卡片列表。
        以前这里是 el-table，窄屏上五列塞不下，要先横向拖到最右边才够得着「编辑」；
        卡片把标题、旅行、日期、状态竖着排开，操作永远在原地。
      -->
      <div v-if="loading" class="recent-journal-list">
        <article v-for="index in 3" :key="index" class="recent-journal-card">
          <el-skeleton :rows="2" animated />
        </article>
      </div>
      <div v-else class="recent-journal-list">
        <article v-for="row in stats.recent" :key="row.id" class="recent-journal-card">
          <header><strong>{{ titleLabel(row) }}</strong><span class="recent-journal-status">{{ statusLabel(row.status) }}</span></header>
          <dl>
            <div><dt>旅行</dt><dd>{{ tripLabel(row) }}</dd></div>
            <div><dt>日期</dt><dd>{{ row.occurredOn || '—' }}</dd></div>
          </dl>
          <footer><el-button size="small" @click="router.push('/journals/' + row.id)">编辑</el-button></footer>
        </article>
        <el-empty v-if="!stats.recent.length" :image-size="48" description="还没有日记" />
      </div>
    </div>
  </div>
</template>
