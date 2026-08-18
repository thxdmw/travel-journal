<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { journalApi } from '@/api/journal'
import { tripApi, type TripOption } from '@/api/trip'
import { useRoute, useRouter } from 'vue-router'
import type { JournalEntry, JournalStatus } from '@/types/journal'

/*
 * 后台日记管理。
 *
 * 在这之前，一篇不属于任何旅行、又掉出首页「最近六条」的日记就没有入口了——只能
 * 记住 id 手工拼地址。旅行工作台只管自己那一场旅行，独立日记本来就不在里面。
 */

export interface JournalManagerPageDeps {
  message(text: string): void
  fail(error: unknown): void
  confirm(text: string): Promise<unknown>
}

const props = defineProps<JournalManagerPageDeps>()
const route = useRoute()
const router = useRouter()
const data = ref<JournalEntry[]>([])
const trips = ref<TripOption[]>([])
const loading = ref(false)
/** 第一次加载还没回来。之后翻页、换筛选都不再算首次，避免整页骨架屏反复闪。 */
const firstLoad = ref(true)
const total = ref(0)
const statusOptions: { value: JournalStatus | '', label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'PUBLISHED', label: '已发布' },
]

function intParam(name: string, fallback: number): number {
  const raw = route.query[name]
  const value = Number(Array.isArray(raw) ? raw[0] : raw)
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback
}
function textParam(name: string): string {
  const raw = route.query[name]
  return (Array.isArray(raw) ? raw[0] : raw) ?? ''
}

const query = reactive({
  page: intParam('page', 1),
  pageSize: 20,
  keyword: textParam('q'),
  status: textParam('status') as JournalStatus | '',
  tripId: textParam('tripId') ? Number(textParam('tripId')) : null as number | null,
})

/** 把当前筛选写进地址栏，刷新和前进后退都能回到同一页。 */
function syncRoute() {
  const next: Record<string, string> = {}
  if (query.page > 1) next.page = String(query.page)
  if (query.keyword) next.q = query.keyword
  if (query.status) next.status = query.status
  if (query.tripId != null) next.tripId = String(query.tripId)
  void router.replace({ path: '/journals', query: next })
}

async function load() {
  loading.value = true
  try {
    const page = await journalApi.list({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      status: query.status || undefined,
      tripId: query.tripId ?? undefined,
    })
    data.value = page.items
    total.value = page.total
  } catch (error) {
    props.fail(error)
  } finally {
    loading.value = false
    firstLoad.value = false
  }
}

/** 换筛选条件必须回到第一页，否则会停在一个新结果集里根本不存在的页码上。 */
async function search() {
  query.page = 1
  syncRoute()
  await load()
}

async function changePage(page: number) {
  query.page = page
  syncRoute()
  await load()
}

function statusLabel(status: JournalStatus): string {
  return status === 'DRAFT' ? '草稿' : '已发布'
}
function tripLabel(row: JournalEntry): string {
  return row.tripTitle || '独立日记'
}
function titleLabel(row: JournalEntry): string {
  return row.title || '未命名日记'
}
function dayLabel(value: string | null): string {
  return value ? value.slice(0, 10) : '—'
}

function edit(row: JournalEntry) {
  void router.push('/journals/' + row.id)
}

async function remove(row: JournalEntry) {
  try {
    // 沿用编辑器那套提示：删日记会连带删掉它的图片，事先说清楚有多少张
    const { count } = await journalApi.mediaCount(row.id)
    const suffix = count > 0 ? `，同时删除 ${count} 张图片` : ''
    await props.confirm(`确定删除《${titleLabel(row)}》吗${suffix}？`)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') props.fail(error)
    return
  }
  try {
    await journalApi.remove(row.id)
    props.message('日记已删除')
    // 删掉当前页最后一条时往前退一页，不然会停在一个空页上
    if (data.value.length === 1 && query.page > 1) query.page -= 1
    syncRoute()
    await load()
  } catch (error) {
    props.fail(error)
  }
}

// 浏览器前进后退只改地址栏，页面得跟着回到那一页
watch(() => route.query, next => {
  const page = intParam('page', 1)
  const keyword = textParam('q')
  const status = textParam('status') as JournalStatus | ''
  const tripId = textParam('tripId') ? Number(textParam('tripId')) : null
  if (page === query.page && keyword === query.keyword && status === query.status && tripId === query.tripId) return
  Object.assign(query, { page, keyword, status, tripId })
  void next
  void load()
})

onMounted(async () => {
  try {
    trips.value = await tripApi.options()
  } catch (error) {
    props.fail(error)
  }
  await load()
})
</script>

<template>
  <div>
    <div class="page-head">
      <div><h2>日记管理</h2><p>所有日记都在这里，包括不属于任何旅行的独立日记。</p></div>
      <el-button type="primary" @click="router.push('/journals/new')">写日记</el-button>
    </div>
    <div class="panel">
      <div class="toolbar">
        <el-input v-model="query.keyword" clearable placeholder="搜索标题或摘要" style="max-width: 260px" @keyup.enter="search" />
        <el-select v-model="query.status" class="journal-filter" placeholder="状态" @change="search">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="query.tripId" class="journal-filter" filterable clearable placeholder="所属旅行" @change="search">
          <el-option v-for="item in trips" :key="item.id" :label="item.title" :value="item.id" />
        </el-select>
        <el-button @click="search">查询</el-button>
      </div>
      <div class="panel-pad">
        <!--
          首次加载给骨架屏，翻页和筛选给 v-loading。
          两者分工不同：第一次进来版面是空的，骨架屏先把行占住，数据到了只换内容；
          已经有一屏内容时再盖骨架屏反而是倒退，那种情况用遮罩保留旧内容更好读。
        -->
        <div v-if="firstLoad" class="journal-skeleton">
          <el-skeleton v-for="index in 4" :key="index" :rows="2" animated />
        </div>
        <el-table v-else v-loading="loading" :data="data" class="hide-on-mobile">
          <el-table-column label="日记"><template #default="{ row }">{{ titleLabel(row) }}</template></el-table-column>
          <el-table-column label="旅行" width="180"><template #default="{ row }">{{ tripLabel(row) }}</template></el-table-column>
          <el-table-column prop="occurredOn" label="日期" width="130" />
          <el-table-column label="状态" width="100"><template #default="{ row }">{{ statusLabel(row.status) }}</template></el-table-column>
          <el-table-column label="更新时间" width="130"><template #default="{ row }">{{ dayLabel(row.updatedAt) }}</template></el-table-column>
          <el-table-column width="140"><template #default="{ row }">
            <el-button link type="primary" @click="edit(row)">编辑</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template></el-table-column>
        </el-table>
        <!-- 手机上表格横向滚不动，改成一张张卡片；遮罩不能只盖桌面那张表 -->
        <div v-if="!firstLoad" v-loading="loading" class="journal-card-list show-on-mobile">
          <article v-for="row in data" :key="row.id" class="journal-manage-card">
            <h3>{{ titleLabel(row) }}</h3>
            <p><span class="status">{{ statusLabel(row.status) }}</span><span>{{ tripLabel(row) }}</span></p>
            <footer><span>{{ row.occurredOn }}</span>
              <el-button link type="primary" @click="edit(row)">编辑</el-button>
              <el-button link type="danger" @click="remove(row)">删除</el-button>
            </footer>
          </article>
        </div>
        <el-empty v-if="!data.length && !loading && !firstLoad" description="没有符合条件的日记" />
        <el-pagination
          v-if="total > query.pageSize"
          class="journal-pager"
          layout="prev, pager, next"
          :current-page="query.page"
          :page-size="query.pageSize"
          :total="total"
          @current-change="changePage" />
      </div>
    </div>
  </div>
</template>
