<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { journalApi } from '@/api/journal'
import { tripApi } from '@/api/trip'
import { useRouter } from 'vue-router'
import type { JournalEntry, JournalStatus } from '@/types/journal'

const props = defineProps<{ fail(error: unknown): void }>()
const router = useRouter()
const stats = reactive<{ trips: number, drafts: number, published: number, recent: JournalEntry[] }>({
  trips: 0,
  drafts: 0,
  published: 0,
  recent: [],
})

function statusLabel(status: JournalStatus): string {
  return status === 'DRAFT' ? '草稿' : '已发布'
}

onMounted(async () => {
  try {
    const [trips, journals] = await Promise.all([
      tripApi.list({ page: 1, pageSize: 100 }),
      journalApi.list({ page: 1, pageSize: 100 }),
    ])
    stats.trips = trips.total
    stats.drafts = journals.items.filter(item => item.status === 'DRAFT').length
    stats.published = journals.items.filter(item => item.status === 'PUBLISHED').length
    stats.recent = journals.items.slice(0, 6)
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
      <div class="metric"><span>当前主题</span><strong style="font-size: 20px">远行手记</strong></div>
    </div>
    <div class="panel panel-pad">
      <h3 style="color: var(--tj-primary); font-family: var(--tj-serif)">最近编辑</h3>
      <el-table :data="stats.recent" max-height="calc(100vh - 430px)">
        <el-table-column prop="title" label="日记" />
        <el-table-column prop="occurredOn" label="日期" width="130" />
        <el-table-column label="状态" width="100"><template #default="{ row }">{{ statusLabel(row.status) }}</template></el-table-column>
        <el-table-column width="100"><template #default="{ row }"><el-button link type="primary" @click="router.push('/journals/' + row.id)">编辑</el-button></template></el-table-column>
      </el-table>
    </div>
  </div>
</template>
