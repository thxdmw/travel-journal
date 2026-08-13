<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { budgetApi, type BudgetSummary, type CategorySummary, type Expense, type ExpenseRequest } from '@/api/budget'
import { itineraryApi, type ItineraryItem, type ItineraryRequest } from '@/api/itinerary'
import { journalApi } from '@/api/journal'
import { mapApi } from '@/api/map'
import { tripApi } from '@/api/trip'
import { create as createMap } from '@/map'
import type { Decimal } from '@/types/common'
import type { JournalEntry } from '@/types/journal'
import type { LocationView, MapSearchStatus } from '@/types/map'
import type { MarkerHandle, TravelMapInstance } from '@/types/travel-map'
import type { StopRequest, Trip, TripDashboard, TripStatus, TripStop } from '@/types/trip'
import { useRoute, useRouter } from 'vue-router'

export interface TripWorkspacePageDeps {
  message(text: string): void
  warning(text: string): void
  error(text: string): void
  info(text: string): void
  fail(error: unknown): void
  confirm(text: string): Promise<unknown>
}

interface FormHandle {
  validate(): Promise<unknown>
  clearValidate(fields?: string[]): void
}

interface StopForm extends Omit<StopRequest, 'latitude' | 'longitude'> {
  latitude: Decimal | null
  longitude: Decimal | null
}

interface ItemForm extends ItineraryRequest {
  plannedCost: Decimal | null
}

interface ExpenseForm extends Omit<ExpenseRequest, 'budgetCategoryId' | 'amount'> {
  budgetCategoryId: number | null
  amount: Decimal | null
}

interface WorkspaceData {
  trip: Trip | null
  dashboard: TripDashboard | null
  stops: TripStop[]
  itinerary: ItineraryItem[]
  budget: BudgetSummary | null
  expenses: Expense[]
  journals: JournalEntry[]
}

type BlockName = keyof WorkspaceData
type TabName = 'overview' | 'stops' | 'itinerary' | 'budget' | 'expenses' | 'journals' | 'settings'
type RemoveKind = 'stop' | 'item' | 'expense'

const props = defineProps<TripWorkspacePageDeps>()
const route = useRoute()
const router = useRouter()
const tripId = Number(Array.isArray(route.params.id) ? route.params.id[0] : route.params.id)
const tabOrder: TabName[] = ['overview', 'stops', 'itinerary', 'budget', 'expenses', 'journals', 'settings']
const routeTab = typeof route.query.tab === 'string' && tabOrder.includes(route.query.tab as TabName) ? route.query.tab as TabName : 'overview'
const active = ref<TabName>(routeTab)
const allowTextInput = !window.matchMedia?.('(pointer: coarse)').matches
const mobileQuery = window.matchMedia('(max-width:760px)')
const isMobile = ref(mobileQuery.matches)
const data = reactive<WorkspaceData>({ trip: null, dashboard: null, stops: [], itinerary: [], budget: null, expenses: [], journals: [] })
const tabBlocks: Record<TabName, BlockName[]> = {
  overview: ['trip', 'dashboard'], stops: ['stops'], itinerary: ['itinerary', 'stops'],
  budget: ['budget'], expenses: ['expenses', 'budget', 'stops'], journals: ['journals'], settings: ['trip'],
}
const cascade: Partial<Record<BlockName, BlockName[]>> = {
  trip: ['dashboard'], stops: ['dashboard', 'itinerary', 'expenses', 'journals'], itinerary: ['dashboard'],
  budget: ['dashboard', 'expenses'], expenses: ['dashboard', 'budget'], journals: ['dashboard'],
}
const stale = reactive<Record<BlockName, boolean>>({ trip: true, dashboard: true, stops: true, itinerary: true, budget: true, expenses: true, journals: true })
const loadingBlocks = reactive<Record<BlockName, boolean>>({ trip: false, dashboard: false, stops: false, itinerary: false, budget: false, expenses: false, journals: false })
const ready = computed(() => Boolean(data.trip))
const isLoading = (...names: BlockName[]) => names.some(name => loadingBlocks[name])

async function loadBlock(name: BlockName) {
  if (name === 'trip') data.trip = await tripApi.get(tripId)
  else if (name === 'dashboard') data.dashboard = await tripApi.dashboard(tripId)
  else if (name === 'stops') data.stops = await tripApi.stops(tripId)
  else if (name === 'itinerary') data.itinerary = await itineraryApi.list(tripId)
  else if (name === 'budget') data.budget = await budgetApi.summary(tripId)
  else if (name === 'expenses') data.expenses = await budgetApi.expenses(tripId)
  else data.journals = (await journalApi.list({ page: 1, pageSize: 100, tripId })).items
}

async function ensure(names: BlockName[], force = false) {
  const targets = [...new Set(names)].filter(name => force || stale[name])
  await Promise.all(targets.map(async name => {
    loadingBlocks[name] = true
    try { await loadBlock(name); stale[name] = false }
    catch (error) { stale[name] = true; props.fail(error) }
    finally { loadingBlocks[name] = false }
  }))
}

function markStale(...names: BlockName[]) {
  names.forEach(name => {
    stale[name] = true
    cascade[name]?.forEach(target => { stale[target] = true })
  })
}

function invalidate(...names: BlockName[]) {
  markStale(...names)
  return ensure(tabBlocks[active.value])
}

const stopDialog = ref(false)
const itemDialog = ref(false)
const expenseDialog = ref(false)
const editingStop = ref<number | null>(null)
const editingItem = ref<number | null>(null)
const editingExpense = ref<number | null>(null)
const stopFormRef = ref<FormHandle | null>(null)
const itemFormRef = ref<FormHandle | null>(null)
const expenseFormRef = ref<FormHandle | null>(null)
const savingStop = ref(false)
const savingItem = ref(false)
const savingExpense = ref(false)
const savingBudgetAll = ref(false)
const savingCategoryIds = ref<number[]>([])
const mapStatus = ref<MapSearchStatus>({ provider: 'amap', searchEnabled: false, coordinateSystem: 'WGS84' })
const locationKeyword = ref('')
const locationResults = ref<LocationView[]>([])
const locationLoading = ref(false)
const stopMapEl = ref<HTMLElement | null>(null)
let pickerMap: TravelMapInstance | null = null
let pickerMarker: MarkerHandle | null = null
let pickerMapToken = 0
let pickerWheelHandler: ((event: WheelEvent) => void) | null = null
let tabSwipeStart: { x: number, moved: boolean } | null = null
let suppressTabClick = false

function blankStop(): StopForm {
  return { cityName: '', regionName: '', countryName: '中国', countryCode: 'CN', latitude: null, longitude: null, placeId: undefined, formattedAddress: '', adcode: '', coordinateSystem: 'WGS84', locationSource: 'MANUAL', arrivalDate: null, departureDate: null, sortOrder: 0, note: '' }
}
function blankItem(): ItemForm {
  return { tripStopId: null, itemDate: '', startTime: null, endTime: null, type: 'ATTRACTION', title: '', address: '', note: '', plannedCost: 0, completed: false, sortOrder: 0, allowOutsideTripDates: false }
}
function blankExpense(): ExpenseForm {
  return { budgetCategoryId: null, tripStopId: null, expenseDate: '', amount: null, description: '', merchant: '', note: '' }
}
const stopForm = reactive<StopForm>(blankStop())
const itemForm = reactive<ItemForm>(blankItem())
const expenseForm = reactive<ExpenseForm>(blankExpense())

function fillForm<T extends object>(form: T, blank: () => T, row?: Partial<T>) {
  const template = blank()
  Object.assign(form, template)
  if (!row) return
  const target = form as Record<string, unknown>
  const source = row as Record<string, unknown>
  Object.keys(template).forEach(key => { if (source[key] !== undefined) target[key] = source[key] })
}
const required = (message: string, trigger = 'blur') => ({ required: true, message, trigger })
const check = (test: (value: unknown) => boolean, message: string, trigger = 'blur') => ({
  validator: (_rule: unknown, value: unknown, callback: (error?: Error) => void) => callback(test(value) ? undefined : new Error(message)), trigger,
})
const stopRules = {
  cityName: [required('请填写城市或地点名称')], countryName: [required('请填写国家')],
  latitude: [required('请搜索地点或在地图上选点', 'change')], longitude: [required('请搜索地点或在地图上选点', 'change')],
  departureDate: [check(value => !value || !stopForm.arrivalDate || String(value) >= stopForm.arrivalDate, '离开日期不能早于到达日期', 'change')],
}
const itemRules = {
  title: [required('请填写行程标题')], type: [required('请选择行程类型', 'change')],
  itemDate: [required('请选择行程日期', 'change'), check(value => !value || !data.trip || itemForm.allowOutsideTripDates || (String(value) >= data.trip.startDate && String(value) <= data.trip.endDate), '日期不在旅行范围内，如确需保留请勾选下方的例外', 'change')],
  endTime: [check(value => !value || !itemForm.startTime || String(value) >= itemForm.startTime, '结束时间不能早于开始时间', 'change')],
  plannedCost: [check(value => value === null || value === '' || Number(value) >= 0, '预计花费不能为负数', 'change')],
}
const expenseRules = {
  description: [required('请填写支出说明')], expenseDate: [required('请选择支出日期', 'change')],
  budgetCategoryId: [required('请选择预算分类', 'change')],
  amount: [required('请填写支出金额', 'change'), check(value => Number(value) > 0, '支出金额必须大于 0', 'change')],
}
async function validateForm(form: FormHandle | null) {
  if (!form) return true
  try { await form.validate(); return true }
  catch { props.warning('请先补全标记为必填的内容'); return false }
}

async function openStop(row?: TripStop) {
  editingStop.value = row?.id ?? null
  fillForm(stopForm, blankStop, row ? {
    ...row,
    regionName: row.regionName || '', countryCode: row.countryCode || '', placeId: row.placeId || undefined,
    formattedAddress: row.formattedAddress || '', adcode: row.adcode || '', locationSource: row.locationSource || '', note: row.note || '',
  } : undefined)
  locationKeyword.value = row?.formattedAddress || row?.cityName || ''
  locationResults.value = []
  stopDialog.value = true
  void nextTick(() => stopFormRef.value?.clearValidate())
  try { mapStatus.value = await mapApi.status() } catch { mapStatus.value.searchEnabled = false }
  await nextTick()
  window.setTimeout(() => { void initStopMap() }, 80)
}

function closeStop() {
  editingStop.value = null
  locationResults.value = []
  pickerMapToken += 1
  if (pickerWheelHandler && stopMapEl.value) stopMapEl.value.removeEventListener('wheel', pickerWheelHandler)
  pickerWheelHandler = null
  pickerMarker = null
  pickerMap?.destroy()
  pickerMap = null
}

async function initStopMap() {
  if (!stopMapEl.value || pickerMap) return
  const token = ++pickerMapToken
  const valid = Number.isFinite(Number(stopForm.latitude)) && Number.isFinite(Number(stopForm.longitude)) && !(Number(stopForm.latitude) === 0 && Number(stopForm.longitude) === 0)
  const center: [number, number] = valid ? [Number(stopForm.latitude), Number(stopForm.longitude)] : [35.4, 104.2]
  let map: TravelMapInstance | null
  try { map = await createMap(stopMapEl.value, { center, zoom: valid ? 11 : 4, scrollWheelZoom: false }) }
  catch (error) { props.warning(`地图加载失败：${error instanceof Error ? error.message : '请刷新页面重试'}`); return }
  if (token !== pickerMapToken || !map) { map?.destroy(); return }
  pickerMap = map
  map.onClick((latitude, longitude) => { void pickLocation(latitude, longitude, true) })
  pickerWheelHandler = event => {
    if (!event.ctrlKey) return
    event.preventDefault(); event.stopPropagation()
    pickerMap?.zoomBy(event.deltaY < 0 ? 1 : -1)
  }
  stopMapEl.value.addEventListener('wheel', pickerWheelHandler, { passive: false })
  if (valid) setPickerMarker(center[0], center[1])
  requestAnimationFrame(() => pickerMap?.invalidateSize())
}

function setPickerMarker(latitude: number, longitude: number) {
  if (!pickerMap) return
  pickerMarker?.remove()
  pickerMarker = pickerMap.addMarker([latitude, longitude], { draggable: true, onDragEnd: (lat, lng) => { void pickLocation(lat, lng, true) } })
}

function applyLocation(item: LocationView, move = true) {
  stopForm.cityName = item.city || item.name || stopForm.cityName
  stopForm.regionName = item.province || item.district || ''
  stopForm.countryName = item.country || '中国'
  stopForm.countryCode = item.countryCode || 'CN'
  stopForm.latitude = Number(item.latitude); stopForm.longitude = Number(item.longitude)
  stopForm.placeId = item.placeId || undefined; stopForm.formattedAddress = item.formattedAddress || ''
  stopForm.adcode = item.adcode || ''; stopForm.coordinateSystem = item.coordinateSystem; stopForm.locationSource = item.locationSource || 'MAP_PICK'
  setPickerMarker(stopForm.latitude, stopForm.longitude)
  if (move && pickerMap) pickerMap.fitBounds([[stopForm.latitude, stopForm.longitude]], { maxZoom: Math.max(pickerMap.getZoom(), 12) })
  locationResults.value = []
  stopFormRef.value?.clearValidate(['latitude', 'longitude'])
}

async function pickLocation(latitude: number, longitude: number, reverse: boolean) {
  stopForm.latitude = Number(latitude.toFixed(6)); stopForm.longitude = Number(longitude.toFixed(6))
  stopForm.locationSource = 'MAP_PICK'; stopForm.coordinateSystem = 'WGS84'
  setPickerMarker(stopForm.latitude, stopForm.longitude)
  stopFormRef.value?.clearValidate(['latitude', 'longitude'])
  if (!reverse || !mapStatus.value.searchEnabled) return
  try { applyLocation(await mapApi.reverse(stopForm.latitude, stopForm.longitude), false) }
  catch (error) { props.warning(error instanceof Error ? error.message : '地址识别失败，可继续手动填写') }
}

async function searchLocations() {
  if (!locationKeyword.value.trim()) { props.warning('请输入城市、景点或地址'); return }
  if (!mapStatus.value.searchEnabled) { props.warning('请先在服务端配置 AMAP_WEB_SERVICE_KEY'); return }
  locationLoading.value = true
  try {
    locationResults.value = await mapApi.search(locationKeyword.value, stopForm.regionName)
    if (!locationResults.value.length) props.info('没有找到匹配地点')
  } catch (error) { props.fail(error) }
  finally { locationLoading.value = false }
}

function stopBody(): StopRequest | null {
  if (stopForm.latitude === null || stopForm.longitude === null) return null
  return { ...stopForm, latitude: stopForm.latitude, longitude: stopForm.longitude }
}
async function saveStop() {
  if (!await validateForm(stopFormRef.value)) return
  const body = stopBody(); if (!body) return
  savingStop.value = true
  try {
    if (editingStop.value) await tripApi.updateStop(editingStop.value, body); else await tripApi.createStop(tripId, body)
    stopDialog.value = false; props.message('城市已保存'); await invalidate('stops')
  } catch (error) { props.fail(error) }
  finally { savingStop.value = false }
}

function openItem(row?: ItineraryItem) {
  editingItem.value = row?.id ?? null
  fillForm(itemForm, blankItem, row ? { ...row, address: row.address || '', note: row.note || '' } : undefined)
  itemDialog.value = true
  void nextTick(() => itemFormRef.value?.clearValidate())
}
async function saveItem() {
  if (!await validateForm(itemFormRef.value)) return
  savingItem.value = true
  try {
    if (editingItem.value) await itineraryApi.update(editingItem.value, itemForm); else await itineraryApi.create(tripId, itemForm)
    itemDialog.value = false; props.message('行程已保存'); await invalidate('itinerary')
  } catch (error) { props.fail(error) }
  finally { savingItem.value = false }
}
async function toggleCompleted(row: ItineraryItem) {
  try { await itineraryApi.setCompleted(row.id, Boolean(row.completed)); stale.dashboard = true }
  catch (error) { row.completed = !row.completed; props.fail(error) }
}

function openExpense(row?: Expense) {
  editingExpense.value = row?.id ?? null
  fillForm(expenseForm, blankExpense, row ? { ...row, merchant: row.merchant || '', note: row.note || '' } : undefined)
  expenseDialog.value = true
  void nextTick(() => expenseFormRef.value?.clearValidate())
}
function expenseBody(): ExpenseRequest | null {
  if (expenseForm.budgetCategoryId === null || expenseForm.amount === null) return null
  return { ...expenseForm, budgetCategoryId: expenseForm.budgetCategoryId, amount: expenseForm.amount }
}
async function saveExpense() {
  if (!await validateForm(expenseFormRef.value)) return
  const body = expenseBody(); if (!body) return
  savingExpense.value = true
  try {
    if (editingExpense.value) await budgetApi.updateExpense(editingExpense.value, body); else await budgetApi.createExpense(tripId, body)
    expenseDialog.value = false; props.message('支出已保存'); await invalidate('expenses')
  } catch (error) { props.fail(error) }
  finally { savingExpense.value = false }
}

const isCategorySaving = (id: number) => savingCategoryIds.value.includes(id)
const categoryBody = (row: CategorySummary) => ({ code: row.code, name: row.name, plannedAmount: row.planned })
function categoryDrafts(excludedIds: number[] = []) {
  const excluded = new Set(excludedIds)
  return new Map((data.budget?.categories || []).filter(row => !excluded.has(row.id)).map(row => [row.id, row.planned]))
}
function restoreCategoryDrafts(drafts: Map<number, Decimal>) {
  data.budget?.categories.forEach(row => { const value = drafts.get(row.id); if (value !== undefined) row.planned = value })
}
async function refreshBudget(drafts?: Map<number, Decimal>) { await invalidate('budget'); if (drafts) restoreCategoryDrafts(drafts) }
async function saveCategory(row: CategorySummary) {
  if (savingBudgetAll.value || isCategorySaving(row.id)) return
  const drafts = categoryDrafts([row.id]); savingCategoryIds.value.push(row.id)
  try { await budgetApi.updateCategory(row.id, categoryBody(row)); await refreshBudget(drafts); props.message('预算已更新') }
  catch (error) { props.fail(error) }
  finally { savingCategoryIds.value = savingCategoryIds.value.filter(id => id !== row.id) }
}
async function saveAllCategories() {
  const rows = [...(data.budget?.categories || [])]
  if (!rows.length || savingBudgetAll.value) return
  savingBudgetAll.value = true
  try {
    const results = await Promise.allSettled(rows.map(row => budgetApi.updateCategory(row.id, categoryBody(row))))
    const failed = results.flatMap((result, index) => result.status === 'rejected' && rows[index] ? [rows[index]] : [])
    await refreshBudget(new Map(failed.map(row => [row.id, row.planned])))
    if (failed.length) props.error(`有 ${failed.length} 项预算保存失败，输入内容已保留，请重试。`); else props.message('全部预算已保存')
  } finally { savingBudgetAll.value = false }
}

async function remove(kind: RemoveKind, row: TripStop | ItineraryItem | Expense) {
  const labels: Record<RemoveKind, string> = { stop: '城市', item: '行程', expense: '支出' }
  const blocks: Record<RemoveKind, BlockName> = { stop: 'stops', item: 'itinerary', expense: 'expenses' }
  try {
    await props.confirm(`确定删除这条${labels[kind]}记录吗？`)
    if (kind === 'stop') await tripApi.deleteStop(row.id)
    else if (kind === 'item') await itineraryApi.remove(row.id)
    else await budgetApi.deleteExpense(row.id)
    props.message('已删除'); await invalidate(blocks[kind])
  } catch (error) { if (error !== 'cancel' && error !== 'close') props.fail(error) }
}
async function removeJournal(row: JournalEntry) {
  try {
    let count = 0; try { count = (await journalApi.mediaCount(row.id)).count } catch { count = 0 }
    const prefix = row.status === 'PUBLISHED' ? '这是一篇已发布的日记，删除后前台会立即无法访问。' : ''
    const consequence = count ? `日记正文和其中的 ${count} 张图片会一起删除，且无法恢复。` : '日记删除后无法恢复。'
    await props.confirm(`${prefix}${consequence}确定继续吗？`)
    const result = await journalApi.remove(row.id)
    props.message(result.removedMedia > 0 ? `已删除日记及 ${result.removedMedia} 张图片` : '日记已删除')
    await invalidate('journals')
  } catch (error) { if (error !== 'cancel' && error !== 'close') props.fail(error) }
}

const itineraryTypeOptions = [
  ['TRANSPORT', '交通'], ['HOTEL', '住宿'], ['FOOD', '餐饮'], ['ATTRACTION', '景点'],
  ['SHOPPING', '购物'], ['ACTIVITY', '活动'], ['OTHER', '其他'],
].map(([value, label]) => ({ value, label }))
const tripStatusLabels: Record<TripStatus, string> = { PLANNING: '规划中', ONGOING: '旅行中', COMPLETED: '已完成', ARCHIVED: '已归档' }
const journalStatusLabels = { DRAFT: '草稿', PUBLISHED: '已发布' }
const statusLabel = (value: TripStatus | JournalEntry['status']) => value in tripStatusLabels ? tripStatusLabels[value as TripStatus] : journalStatusLabels[value as JournalEntry['status']]
const itineraryTypeLabel = (value: string) => itineraryTypeOptions.find(item => item.value === value)?.label || value
const timeRange = (start: string | null, end: string | null) => { const from = start?.slice(0, 5) || ''; const to = end?.slice(0, 5) || ''; return from && to ? `${from} – ${to}` : from || to || '—' }

function beginTabSwipe(event: TouchEvent) {
  if (!(event.target instanceof Element) || !event.target.closest('.el-tabs__header')) return
  const touch = event.touches[0]; if (touch) tabSwipeStart = { x: touch.clientX, moved: false }
}
function moveTabSwipe(event: TouchEvent) { const touch = event.touches[0]; if (tabSwipeStart && touch && Math.abs(touch.clientX - tabSwipeStart.x) > 6) tabSwipeStart.moved = true }
function endTabSwipe() { if (tabSwipeStart?.moved) { suppressTabClick = true; window.setTimeout(() => { suppressTabClick = false }, 350) }; tabSwipeStart = null }
function onTabHeaderClick(event: MouseEvent) { if (!suppressTabClick) return; suppressTabClick = false; event.preventDefault(); event.stopPropagation() }
function syncMobile(event: MediaQueryListEvent) { isMobile.value = event.matches }

watch(active, value => {
  if (route.query.tab !== value) {
    const query = Object.fromEntries(Object.entries(route.query).flatMap(([key, item]) => typeof item === 'string' ? [[key, item]] : []))
    void router.replace({ path: route.fullPath.split('?')[0] || `/trips/${tripId}`, query: { ...query, tab: value } })
  }
  void ensure(tabBlocks[value])
})
onMounted(() => { mobileQuery.addEventListener?.('change', syncMobile); void ensure(['trip', ...tabBlocks[active.value]]) })
onBeforeUnmount(() => { mobileQuery.removeEventListener?.('change', syncMobile); closeStop() })
</script>

<template>
  <div v-if="ready && data.trip"><div class="workspace-head"><span class="back" @click="router.push('/trips')">← 返回</span><div><h2>{{ data.trip.title }}</h2><div class="workspace-meta">{{ data.trip.startDate }} — {{ data.trip.endDate }} · {{ statusLabel(data.trip.status) }}</div></div></div>
    <el-tabs v-model="active" class="workspace-tabs" @touchstart.passive="beginTabSwipe" @touchmove.passive="moveTabSwipe" @touchend.passive="endTabSwipe" @click.capture="onTabHeaderClick">
      <el-tab-pane label="概览" name="overview"><div v-loading="isLoading('trip', 'dashboard')" class="tab-loading-host"><div class="dashboard-grid"><div class="metric"><span>城市</span><strong>{{ data.dashboard?.stopCount ?? '—' }}</strong></div><div class="metric"><span>行程</span><strong>{{ data.dashboard?.itineraryCount ?? '—' }}</strong></div><div class="metric"><span>草稿</span><strong>{{ data.dashboard?.draftCount ?? '—' }}</strong></div><div class="metric"><span>已发布</span><strong>{{ data.dashboard?.publishedCount ?? '—' }}</strong></div></div><p>{{ data.trip.summary || '还没有旅行简介。' }}</p></div></el-tab-pane>
      <el-tab-pane label="城市" name="stops"><div class="tab-actions"><el-button type="primary" @click="openStop()">添加城市</el-button></div>
        <el-table v-if="!isMobile" v-loading="isLoading('stops')" :data="data.stops" table-layout="fixed" max-height="calc(100vh - 360px)"><el-table-column prop="cityName" label="城市" /><el-table-column prop="countryName" label="国家" /><el-table-column prop="arrivalDate" label="到达" /><el-table-column prop="departureDate" label="离开" /><el-table-column label="操作" width="140"><template #default="{ row }"><div class="table-actions"><el-button size="small" @click="openStop(row)">编辑</el-button><el-button size="small" type="danger" plain @click="remove('stop', row)">删除</el-button></div></template></el-table-column></el-table>
        <div v-else v-loading="isLoading('stops')" class="workspace-mobile-list"><article v-for="row in data.stops" :key="row.id" class="workspace-mobile-card"><header><strong :title="row.cityName">{{ row.cityName }}</strong><span>{{ row.countryName || '—' }}</span></header><dl><div><dt>到达</dt><dd>{{ row.arrivalDate || '—' }}</dd></div><div><dt>离开</dt><dd>{{ row.departureDate || '—' }}</dd></div></dl><footer><el-button size="small" @click="openStop(row)">编辑</el-button><el-button size="small" type="danger" plain @click="remove('stop', row)">删除</el-button></footer></article><el-empty v-if="!isLoading('stops') && !data.stops.length" :image-size="48" description="还没有城市" /></div>
      </el-tab-pane>
      <el-tab-pane label="行程" name="itinerary"><div class="tab-actions"><el-button type="primary" @click="openItem()">添加行程</el-button></div>
        <el-table v-if="!isMobile" v-loading="isLoading('itinerary')" :data="data.itinerary" table-layout="fixed" max-height="calc(100vh - 360px)"><el-table-column prop="itemDate" label="日期" width="120" /><el-table-column label="时间" width="140"><template #default="{ row }">{{ timeRange(row.startTime, row.endTime) }}</template></el-table-column><el-table-column label="类型" width="110"><template #default="{ row }">{{ itineraryTypeLabel(row.type) }}</template></el-table-column><el-table-column prop="title" label="行程" /><el-table-column label="完成" width="80"><template #default="{ row }"><el-checkbox v-model="row.completed" @change="toggleCompleted(row)" /></template></el-table-column><el-table-column label="操作" width="140"><template #default="{ row }"><div class="table-actions"><el-button size="small" @click="openItem(row)">编辑</el-button><el-button size="small" type="danger" plain @click="remove('item', row)">删除</el-button></div></template></el-table-column></el-table>
        <div v-else v-loading="isLoading('itinerary')" class="workspace-mobile-list"><article v-for="row in data.itinerary" :key="row.id" class="workspace-mobile-card"><header><strong>{{ row.title }}</strong><span>{{ itineraryTypeLabel(row.type) }}</span></header><dl><div><dt>日期</dt><dd>{{ row.itemDate || '—' }}</dd></div><div><dt>时间</dt><dd>{{ timeRange(row.startTime, row.endTime) }}</dd></div><div><dt>完成</dt><dd><el-checkbox v-model="row.completed" @change="toggleCompleted(row)" /></dd></div></dl><footer><el-button size="small" @click="openItem(row)">编辑</el-button><el-button size="small" type="danger" plain @click="remove('item', row)">删除</el-button></footer></article><el-empty v-if="!isLoading('itinerary') && !data.itinerary.length" :image-size="48" description="还没有行程" /></div>
      </el-tab-pane>
      <el-tab-pane label="预算" name="budget"><div v-loading="isLoading('budget')" class="tab-loading-host"><div class="budget-summary"><div class="item"><span>总预算</span><strong>{{ data.budget?.currency }} {{ data.budget?.plannedTotal ?? '—' }}</strong></div><div class="item"><span>已支出</span><strong>{{ data.budget?.currency }} {{ data.budget?.actualTotal ?? '—' }}</strong></div><div class="item"><span>剩余</span><strong :class="{ over: data.budget && data.budget.remaining < 0 }">{{ data.budget?.currency }} {{ data.budget?.remaining ?? '—' }}</strong></div></div>
        <div class="budget-actions"><span>修改多项后可一次提交</span><el-button type="primary" :loading="savingBudgetAll" :disabled="!data.budget?.categories.length" @click="saveAllCategories">全部保存</el-button></div>
        <el-table v-if="!isMobile" :data="data.budget?.categories || []" table-layout="fixed" max-height="calc(100vh - 470px)"><el-table-column prop="name" label="分类" /><el-table-column label="计划金额" min-width="180"><template #default="{ row }"><el-input-number v-model="row.planned" class="budget-amount-input" :min="0" :precision="2" /></template></el-table-column><el-table-column prop="actual" label="实际支出" /><el-table-column prop="remaining" label="剩余" /><el-table-column width="90"><template #default="{ row }"><el-button link :loading="isCategorySaving(row.id)" :disabled="savingBudgetAll" @click="saveCategory(row)">保存</el-button></template></el-table-column></el-table>
        <div v-else class="workspace-mobile-list workspace-mobile-list--budget"><article v-for="row in data.budget?.categories || []" :key="row.id" class="workspace-mobile-card"><header><strong>{{ row.name }}</strong><span>{{ data.budget?.currency }}</span></header><label class="mobile-budget-input"><span>计划金额</span><el-input-number v-model="row.planned" class="budget-amount-input" :min="0" :precision="2" /></label><dl><div><dt>实际支出</dt><dd>{{ row.actual }}</dd></div><div><dt>剩余</dt><dd :class="{ over: row.remaining < 0 }">{{ row.remaining }}</dd></div></dl><footer><el-button size="small" :loading="isCategorySaving(row.id)" :disabled="savingBudgetAll" @click="saveCategory(row)">单独保存</el-button></footer></article><el-empty v-if="!data.budget?.categories.length" :image-size="48" description="还没有预算分类" /></div>
      </div></el-tab-pane>
      <el-tab-pane label="支出" name="expenses"><div class="tab-actions"><el-button type="primary" @click="openExpense()">记录支出</el-button></div>
        <el-table v-if="!isMobile" v-loading="isLoading('expenses')" :data="data.expenses" table-layout="fixed" max-height="calc(100vh - 360px)"><el-table-column prop="expenseDate" label="日期" /><el-table-column prop="description" label="说明" /><el-table-column prop="merchant" label="商户" /><el-table-column prop="amount" label="金额" /><el-table-column label="操作" width="140"><template #default="{ row }"><div class="table-actions"><el-button size="small" @click="openExpense(row)">编辑</el-button><el-button size="small" type="danger" plain @click="remove('expense', row)">删除</el-button></div></template></el-table-column></el-table>
        <div v-else v-loading="isLoading('expenses')" class="workspace-mobile-list"><article v-for="row in data.expenses" :key="row.id" class="workspace-mobile-card"><header><strong>{{ row.description }}</strong><span>{{ row.expenseDate || '—' }}</span></header><dl><div><dt>商户</dt><dd>{{ row.merchant || '—' }}</dd></div><div><dt>金额</dt><dd>{{ data.trip.defaultCurrency }} {{ row.amount }}</dd></div></dl><footer><el-button size="small" @click="openExpense(row)">编辑</el-button><el-button size="small" type="danger" plain @click="remove('expense', row)">删除</el-button></footer></article><el-empty v-if="!isLoading('expenses') && !data.expenses.length" :image-size="48" description="还没有支出" /></div>
      </el-tab-pane>
      <el-tab-pane label="日记" name="journals"><div class="tab-actions"><el-button type="primary" @click="router.push(`/journals/new?tripId=${data.trip.id}&from=journals`)">新建日记</el-button></div>
        <el-table v-if="!isMobile" v-loading="isLoading('journals')" :data="data.journals" table-layout="fixed" max-height="calc(100vh - 360px)"><el-table-column prop="title" label="标题" /><el-table-column prop="occurredOn" label="日期" /><el-table-column label="状态"><template #default="{ row }">{{ statusLabel(row.status) }}</template></el-table-column><el-table-column label="操作" width="150"><template #default="{ row }"><div class="table-actions"><el-button size="small" @click="router.push(`/journals/${row.id}?from=journals`)">编辑</el-button><el-button size="small" type="danger" plain @click="removeJournal(row)">删除</el-button></div></template></el-table-column></el-table>
        <div v-else v-loading="isLoading('journals')" class="workspace-mobile-list"><article v-for="row in data.journals" :key="row.id" class="workspace-mobile-card"><header><strong>{{ row.title || '未命名日记' }}</strong><span>{{ statusLabel(row.status) }}</span></header><dl><div><dt>日期</dt><dd>{{ row.occurredOn || '—' }}</dd></div></dl><footer><el-button size="small" @click="router.push(`/journals/${row.id}?from=journals`)">编辑</el-button><el-button size="small" type="danger" plain @click="removeJournal(row)">删除</el-button></footer></article><el-empty v-if="!isLoading('journals') && !data.journals.length" :image-size="48" description="还没有日记" /></div>
      </el-tab-pane>
      <el-tab-pane label="设置" name="settings"><el-descriptions border :column="1"><el-descriptions-item label="Slug">{{ data.trip.slug }}</el-descriptions-item><el-descriptions-item label="默认币种">{{ data.trip.defaultCurrency }}</el-descriptions-item><el-descriptions-item label="封面"><img v-if="data.trip.coverMediaId" class="settings-cover" :src="`/api/media/${data.trip.coverMediaId}/thumbnail`" alt="旅行封面"><span v-else>还没有设置封面，可在旅行管理里编辑</span></el-descriptions-item><el-descriptions-item label="内部备注">{{ data.trip.internalNote || '无' }}</el-descriptions-item></el-descriptions><el-button style="margin-top: 18px" @click="router.push('/themes')">查看主题外观</el-button></el-tab-pane>
    </el-tabs>

    <el-dialog v-model="stopDialog" class="location-dialog" :title="editingStop ? '编辑地点' : '添加地点'" width="min(780px,96vw)" destroy-on-close @closed="closeStop">
      <div class="location-search"><el-input v-model="locationKeyword" clearable placeholder="搜索城市、景点、酒店或详细地址" @keyup.enter="searchLocations"><template #prepend>地点</template></el-input><el-button type="primary" :loading="locationLoading" @click="searchLocations">搜索</el-button></div>
      <div v-if="!mapStatus.searchEnabled" class="map-config-hint">尚未配置地点搜索；仍可直接点击地图选点或在高级设置中填写坐标。</div>
      <div v-if="locationResults.length" class="location-results"><button v-for="item in locationResults" :key="item.placeId || `${item.latitude}-${item.longitude}`" type="button" @click="applyLocation(item)"><strong>{{ item.name }}</strong><span>{{ [item.formattedAddress, item.city, item.district].filter(Boolean).join(' · ') }}</span></button></div>
      <div ref="stopMapEl" class="stop-picker-map"><span class="map-picker-tip map-picker-tip-desktop">点击地图选点 · 拖动标记微调 · Ctrl + 滚轮缩放</span><span class="map-picker-tip map-picker-tip-mobile">点击地图选点 · 拖动标记微调</span></div>
      <el-form ref="stopFormRef" :model="stopForm" :rules="stopRules" label-position="top" class="location-form">
        <div class="form-grid form-grid-2"><el-form-item label="城市 / 地点名称" prop="cityName"><el-input v-model="stopForm.cityName" /></el-form-item><el-form-item label="省份 / 区域"><el-input v-model="stopForm.regionName" /></el-form-item></div>
        <el-form-item label="格式化地址"><el-input v-model="stopForm.formattedAddress" placeholder="选择搜索结果后自动填写" /></el-form-item>
        <el-form-item prop="latitude" class="coordinate-status"><template #label>地点坐标 <small>必填，搜索结果或地图选点会自动填入</small></template><span v-if="stopForm.latitude !== null && stopForm.longitude !== null" class="coordinate-value">{{ stopForm.latitude }}, {{ stopForm.longitude }}</span><span v-else class="coordinate-empty">尚未选点</span></el-form-item>
        <div class="form-grid form-grid-2"><el-form-item label="到达日期"><el-date-picker v-model="stopForm.arrivalDate" :editable="allowTextInput" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择到达日期" /></el-form-item><el-form-item label="离开日期" prop="departureDate"><el-date-picker v-model="stopForm.departureDate" :editable="allowTextInput" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择离开日期" /></el-form-item></div>
        <details class="advanced-location"><summary>高级地点信息</summary><div class="form-grid form-grid-2"><el-form-item label="国家" prop="countryName"><el-input v-model="stopForm.countryName" /></el-form-item><el-form-item label="国家代码"><el-input v-model="stopForm.countryCode" maxlength="2" /></el-form-item></div><div class="form-grid form-grid-2"><el-form-item label="纬度"><el-input-number v-model="stopForm.latitude" :precision="6" :controls="false" /></el-form-item><el-form-item label="经度"><el-input-number v-model="stopForm.longitude" :precision="6" :controls="false" /></el-form-item></div><div class="form-grid form-grid-2"><el-form-item label="行政区代码"><el-input v-model="stopForm.adcode" /></el-form-item><el-form-item label="坐标系"><el-select v-model="stopForm.coordinateSystem"><el-option label="高德 GCJ-02" value="GCJ02" /><el-option label="WGS84" value="WGS84" /></el-select></el-form-item></div></details>
        <el-form-item label="备注"><el-input v-model="stopForm.note" type="textarea" :rows="2" /></el-form-item>
      </el-form><template #footer><el-button @click="stopDialog = false">取消</el-button><el-button type="primary" :loading="savingStop" @click="saveStop">保存地点</el-button></template>
    </el-dialog>
    <el-dialog v-model="itemDialog" :title="editingItem ? '编辑行程' : '添加行程'" width="min(650px,92vw)" destroy-on-close @closed="editingItem = null">
      <el-form ref="itemFormRef" :model="itemForm" :rules="itemRules" label-position="top"><el-form-item label="标题" prop="title"><el-input v-model="itemForm.title" placeholder="例如：清水寺" /></el-form-item>
        <div class="form-grid form-grid-2"><el-form-item label="日期" prop="itemDate"><el-date-picker v-model="itemForm.itemDate" :editable="allowTextInput" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择日期" /></el-form-item><el-form-item label="类型" prop="type"><el-select v-model="itemForm.type"><el-option v-for="item in itineraryTypeOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item></div>
        <div class="form-grid form-grid-2"><el-form-item label="开始"><el-time-picker v-model="itemForm.startTime" :editable="allowTextInput" format="HH时mm分" value-format="HH:mm:ss" placeholder="开始时间" /></el-form-item><el-form-item label="结束" prop="endTime"><el-time-picker v-model="itemForm.endTime" :editable="allowTextInput" format="HH时mm分" value-format="HH:mm:ss" placeholder="结束时间" /></el-form-item></div>
        <div class="form-grid form-grid-2"><el-form-item label="所属城市"><el-select v-model="itemForm.tripStopId" clearable placeholder="不指定"><el-option v-for="item in data.stops" :key="item.id" :label="item.cityName" :value="item.id" /></el-select></el-form-item><el-form-item prop="plannedCost"><template #label>预计花费<small class="form-hint">这一项打算花多少钱，{{ data.trip.defaultCurrency }}</small></template><el-input-number v-model="itemForm.plannedCost" :min="0" :precision="2" controls-position="right" /></el-form-item></div>
        <el-form-item label="地址"><el-input v-model="itemForm.address" /></el-form-item><el-form-item label="备注"><el-input v-model="itemForm.note" type="textarea" /></el-form-item><el-form-item><el-checkbox v-model="itemForm.allowOutsideTripDates">允许日期超出旅行的起止范围</el-checkbox></el-form-item>
      </el-form><template #footer><el-button @click="itemDialog = false">取消</el-button><el-button type="primary" :loading="savingItem" @click="saveItem">保存</el-button></template>
    </el-dialog>
    <el-dialog v-model="expenseDialog" :title="editingExpense ? '编辑支出' : '记录支出'" width="min(600px,92vw)" destroy-on-close @closed="editingExpense = null">
      <el-form ref="expenseFormRef" :model="expenseForm" :rules="expenseRules" label-position="top"><el-form-item label="说明" prop="description"><el-input v-model="expenseForm.description" placeholder="例如：新干线车票" /></el-form-item>
        <div class="form-grid form-grid-2"><el-form-item label="日期" prop="expenseDate"><el-date-picker v-model="expenseForm.expenseDate" :editable="allowTextInput" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择日期" /></el-form-item><el-form-item label="金额" prop="amount"><el-input-number v-model="expenseForm.amount" :min="0.01" :precision="2" /></el-form-item></div>
        <div class="form-grid form-grid-2"><el-form-item label="分类" prop="budgetCategoryId"><el-select v-model="expenseForm.budgetCategoryId" placeholder="选择预算分类"><el-option v-for="item in data.budget?.categories || []" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item><el-form-item label="所属城市"><el-select v-model="expenseForm.tripStopId" clearable placeholder="不指定"><el-option v-for="item in data.stops" :key="item.id" :label="item.cityName" :value="item.id" /></el-select></el-form-item></div>
        <el-form-item label="商户"><el-input v-model="expenseForm.merchant" /></el-form-item><el-form-item label="备注"><el-input v-model="expenseForm.note" type="textarea" /></el-form-item>
      </el-form><template #footer><el-button @click="expenseDialog = false">取消</el-button><el-button type="primary" :loading="savingExpense" @click="saveExpense">保存</el-button></template>
    </el-dialog>
  </div><div v-else style="padding: 80px; text-align: center">正在打开旅行工作台…</div>
</template>
