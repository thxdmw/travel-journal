<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { dashboardApi } from '@/api/dashboard'
import { useRouter } from 'vue-router'
import type { JournalStatus } from '@/types/journal'
import type { RecentJournal } from '@/types/dashboard'

const props = defineProps<{ fail(error: unknown): void }>()
const router = useRouter()
const stats = reactive<{ trips: number, drafts: number, published: number, themeName: string, recent: RecentJournal[] }>({
  trips: 0,
  drafts: 0,
  published: 0,
  themeName: '—',
  recent: [],
})

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
      <div class="metric"><span>旅行总数</span><strong>{{ stats.trips }}</strong></div>
      <div class="metric"><span>草稿日记</span><strong>{{ stats.drafts }}</strong></div>
      <div class="metric"><span>已发布日记</span><strong>{{ stats.published }}</strong></div>
      <div class="metric"><span>当前主题</span><strong style="font-size: 20px">{{ stats.themeName }}</strong></div>
    </div>
    <div class="panel panel-pad">
      <div class="page-head">
        <h3 style="color: var(--tj-primary); font-family: var(--tj-serif)">最近编辑</h3>
        <el-button link type="primary" @click="router.push('/journals')">全部日记</el-button>
      </div>
      <el-table :data="stats.recent" max-height="calc(100vh - 430px)">
        <el-table-column label="日记"><template #default="{ row }">{{ titleLabel(row) }}</template></el-table-column>
        <el-table-column label="旅行" width="180"><template #default="{ row }">{{ tripLabel(row) }}</template></el-table-column>
        <el-table-column prop="occurredOn" label="日期" width="130" />
        <el-table-column label="状态" width="100"><template #default="{ row }">{{ statusLabel(row.status) }}</template></el-table-column>
        <el-table-column width="100"><template #default="{ row }"><el-button link type="primary" @click="router.push('/journals/' + row.id)">编辑</el-button></template></el-table-column>
      </el-table>
    </div>
  </div>
</template>
