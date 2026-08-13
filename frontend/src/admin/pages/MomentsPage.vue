<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { momentApi } from '@/api/moment'
import { tripApi } from '@/api/trip'
import { dropPendingMoment, pendingMoments, queueMoment, updatePendingMoment } from '@/draft/moments'
import { render, type DayRouteController } from '@/route/day-route'
import { simpleMap } from '@/route/simple-map'
import { useRoute, useRouter } from '@/vendor/vue-router-global'
import type { PendingMoment, PendingMomentPhoto } from '@/types/draft'
import type { MomentRequest, MomentView, RoutePoint } from '@/types/moment'
import type { TravelMapInstance } from '@/types/travel-map'
import type { Trip } from '@/types/trip'

export interface MomentsPageDeps {
  session: { user: unknown, offline: boolean }
  message(text: string): void
  warning(text: string): void
  error(text: string): void
  info(text: string): void
  fail(error: unknown): void
  confirm(text: string): Promise<unknown>
  composeConfirm(text: string): Promise<'confirm' | 'cancel' | 'close' | unknown>
}

interface DraftState { content: string, placeName: string, mood: string, latitude: number | null, longitude: number | null, files: File[] }
interface MomentGroup { day: string, items: MomentView[], unsorted: number }
interface EditingMoment { id: number, content: string, placeName: string, mood: string }

const props = defineProps<MomentsPageDeps>()
const router = useRouter()
const route = useRoute()
const trips = ref<Trip[]>([])
const moments = ref<MomentView[]>([])
const loading = ref(false)
const saving = ref(false)
const pending = ref<PendingMoment[]>([])
const syncing = ref(false)
const online = ref(navigator.onLine)
const composing = ref('')
const photoInput = ref<HTMLInputElement | null>(null)
const cameraInput = ref<HTMLInputElement | null>(null)
const photoSheet = ref(false)
const lastTripKey = 'travel-journal.moment-last-trip'
const tripsCacheKey = 'travel-journal.moment-trips'
const queryTripId = typeof route.query.tripId === 'string' ? Number(route.query.tripId) : 0
const tripId = ref<number | null>(queryTripId || Number(localStorage.getItem(lastTripKey)) || null)
const editing = ref<EditingMoment | null>(null)
const locating = ref(false)
const draft = reactive<DraftState>({ content: '', placeName: '', mood: '', latitude: null, longitude: null, files: [] })

const grouped = computed<MomentGroup[]>(() => {
  const groups = new Map<string, MomentView[]>()
  moments.value.forEach(item => {
    if (!item.day) return
    const entries = groups.get(item.day) || []
    entries.push(item)
    groups.set(item.day, entries)
  })
  return Array.from(groups, ([day, items]) => ({ day, items, unsorted: items.filter(item => !item.sorted).length }))
})
const draftPreviews = computed(() => draft.files.map(file => ({ name: file.name, url: URL.createObjectURL(file) })))
const canSubmit = computed(() => Boolean(tripId.value && (draft.content.trim() || draft.files.length)))

function localDate(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function dayLabel(day: string): string {
  if (day === localDate(new Date())) return '今天'
  const previous = new Date(); previous.setDate(previous.getDate() - 1)
  if (day === localDate(previous)) return '昨天'
  return day.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_match, _year, month: string, date: string) => `${Number(month)}月${Number(date)}日`)
}

function timeLabel(value: string | null | undefined, zoneId?: string | null): string {
  if (!value) return ''
  try { return new Intl.DateTimeFormat('zh-CN', { timeZone: zoneId || undefined, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) }
  catch { return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) }
}

async function load() {
  if (!tripId.value) { moments.value = []; return }
  loading.value = true
  try { moments.value = await momentApi.list(tripId.value) }
  catch (error) { if (navigator.onLine) props.fail(error) }
  finally { loading.value = false }
}

function chooseDefaultTrip() {
  if (trips.value.some(item => item.id === tripId.value)) return
  tripId.value = (trips.value.find(item => item.status === 'ONGOING') || trips.value[0])?.id || null
}

async function loadTrips() {
  try {
    trips.value = (await tripApi.list({ page: 1, pageSize: 100 })).items
    localStorage.setItem(tripsCacheKey, JSON.stringify(trips.value))
  } catch (error) {
    try { trips.value = JSON.parse(localStorage.getItem(tripsCacheKey) || '[]') as Trip[] }
    catch { trips.value = [] }
    if (navigator.onLine) props.fail(error)
  }
  chooseDefaultTrip()
}

function clientId(prefix: string): string {
  const suffix = window.crypto?.randomUUID ? window.crypto.randomUUID().replaceAll('-', '') : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return `${prefix}_${suffix}`
}

function occurrencePayload(): MomentRequest {
  const now = new Date(), offset = -now.getTimezoneOffset()
  let zone = ''
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { /* 使用偏移量兜底。 */ }
  if (!zone) { const sign = offset >= 0 ? '+' : '-', absolute = Math.abs(offset); zone = `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}` }
  return { occurredAt: now.toISOString(), occurredLocalDate: localDate(now), occurredZoneId: zone, utcOffsetMinutes: offset }
}

async function refreshPending() { pending.value = tripId.value ? await pendingMoments(tripId.value) : [] }

async function submit() {
  if (!canSubmit.value || saving.value || !tripId.value) return
  saving.value = true
  try {
    const id = clientId('moment')
    const photos: PendingMomentPhoto[] = draft.files.map((file, index) => ({ clientId: clientId('photo'), name: file.name || `photo-${index + 1}.jpg`, type: file.type || 'image/jpeg', blob: file, uploaded: false }))
    const payload: MomentRequest = { clientId: id, tripId: tripId.value, content: draft.content.trim(), placeName: draft.placeName.trim() || undefined, mood: draft.mood.trim() || undefined, latitude: draft.latitude, longitude: draft.longitude, ...occurrencePayload() }
    if (!await queueMoment({ clientId: id, tripId: tripId.value, payload, photos })) throw new Error('这台设备的离线存储不可用或空间不足，请先不要关闭页面')
    Object.assign(draft, { content: '', placeName: '', mood: '', latitude: null, longitude: null, files: [] })
    await refreshPending()
    if (navigator.onLine) void syncPending()
    props.message(navigator.onLine ? '已安全记在本机，正在同步' : '已安全记在本机，联网后自动同步')
  } catch (error) { props.error(error instanceof Error ? error.message : '没能写入本机，请保留当前页面后重试') }
  finally { saving.value = false }
}

let syncPromise: Promise<void> | null = null
async function syncOne(original: PendingMoment) {
  let record = await updatePendingMoment(original.clientId, { state: 'syncing', error: null })
  if (!record) return
  try {
    let serverId = record.serverId
    if (!serverId) {
      serverId = (await momentApi.create(record.payload)).id
      record = await updatePendingMoment(record.clientId, { serverId, state: 'syncing' }) || { ...record, serverId, state: 'syncing' }
    }
    let photos = [...record.photos]
    for (let index = 0; index < photos.length; index++) {
      const photo = photos[index]
      if (!photo || photo.uploaded) continue
      const form = new FormData(); form.append('file', photo.blob, photo.name)
      await momentApi.addPhoto(serverId, form, photo.clientId)
      photos = photos.map((item, position) => position === index ? { ...item, uploaded: true } : item)
      record = await updatePendingMoment(original.clientId, { serverId, photos, state: 'syncing' }) || { ...record, serverId, photos, state: 'syncing' }
    }
    await dropPendingMoment(original.clientId)
  } catch {
    await updatePendingMoment(original.clientId, { state: 'failed', retryCount: record.retryCount + 1, error: navigator.onLine ? '同步失败，点此重试' : '等待网络' })
  }
}

async function syncPending() {
  if (!navigator.onLine) return
  if (syncPromise) return syncPromise
  syncing.value = true
  syncPromise = (async () => {
    for (const record of await pendingMoments()) { if (!navigator.onLine) break; await syncOne(record) }
    await refreshPending(); if (tripId.value) await load()
  })().finally(() => { syncing.value = false; syncPromise = null })
  return syncPromise
}

async function retryPending(item: PendingMoment) { await updatePendingMoment(item.clientId, { state: 'pending', error: null }); await refreshPending(); void syncPending() }
async function discardPending(item: PendingMoment) { try { await props.confirm('放弃这条尚未同步的随手记吗？本机文字和照片会被删除。') } catch { return }; await dropPendingMoment(item.clientId); await refreshPending() }

function pickPhotos(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = Array.from(input.files || []).filter(file => file.type.startsWith('image/'))
  const available = Math.max(0, 9 - draft.files.length)
  draft.files.push(...selected.slice(0, available))
  if (selected.length > available) props.warning('一条随手记最多保留 9 张照片')
  input.value = ''
}
function dropDraftPhoto(index: number) { draft.files.splice(index, 1) }
function capture() { if (window.matchMedia?.('(pointer:coarse)').matches) photoSheet.value = true; else photoInput.value?.click() }
function locate() {
  if (!navigator.geolocation) { props.warning('这台设备不支持定位'); return }
  locating.value = true
  navigator.geolocation.getCurrentPosition(position => { draft.latitude = Number(position.coords.latitude.toFixed(7)); draft.longitude = Number(position.coords.longitude.toFixed(7)); locating.value = false; props.message('已记下当前位置') }, () => { locating.value = false; props.warning('没能取到位置，可以手填地点') }, { enableHighAccuracy: true, timeout: 8000 })
}

const routeDay = ref(''), routeEl = ref<HTMLElement | null>(null), routePoints = ref<RoutePoint[]>([]), replaying = ref(false), replayIndex = ref(-1)
let routeMap: TravelMapInstance | null = null, routeControl: DayRouteController | null = null, routeToken = 0
async function toggleRoute(group: MomentGroup) {
  if (routeDay.value === group.day) { closeRoute(); return }
  closeRoute(); const token = ++routeToken; routeDay.value = group.day
  try { if (tripId.value) routePoints.value = await momentApi.route(tripId.value, group.day) }
  catch (error) { props.fail(error); routeDay.value = ''; return }
  if (!routePoints.value.length) { routeDay.value = ''; props.info('这一天的随手记还没有位置信息，记的时候点一下「位置」就有了'); return }
  await nextTick(); const map = await simpleMap(routeEl.value)
  if (token !== routeToken) { map?.destroy(); return }
  routeMap = map
  routeControl = render(routeMap, routePoints.value, { source: routePoints.value[0]?.source || undefined, onState: state => { replaying.value = state.playing; replayIndex.value = state.index } })
}
function closeRoute() { routeToken++; routeControl?.destroy(); routeControl = null; routeMap?.destroy(); routeMap = null; routeDay.value = ''; routePoints.value = []; replaying.value = false; replayIndex.value = -1 }
function toggleReplay() { routeControl?.play() }

async function removeMoment(item: MomentView) { try { await props.confirm('删除这条随手记吗？') } catch { return }; try { await momentApi.remove(item.id); moments.value = moments.value.filter(entry => entry.id !== item.id) } catch (error) { props.fail(error) } }
function startEdit(item: MomentView) { editing.value = { id: item.id, content: item.content || '', placeName: item.placeName || '', mood: item.mood || '' } }
async function saveEdit() { const value = editing.value; if (!value) return; try { const updated = await momentApi.update(value.id, { content: value.content, placeName: value.placeName || undefined, mood: value.mood || undefined }); const index = moments.value.findIndex(item => item.id === value.id); if (index >= 0) moments.value[index] = updated; editing.value = null; props.message('已修改') } catch (error) { props.fail(error) } }
async function removePhoto(item: MomentView, mediaId: number) { try { await momentApi.removePhoto(item.id, mediaId); item.photos = item.photos.filter(photo => photo.id !== mediaId) } catch (error) { props.fail(error) } }

const aiAvailable = ref(false)
async function compose(group: MomentGroup, useAi: boolean) {
  if (!tripId.value) return
  const sorted = group.items.filter(item => item.sorted)
  const journalIds = [...new Set(sorted.map(item => item.journalEntryId).filter((value): value is number => value != null))]
  if (journalIds.length > 1) { props.warning('这一天的随手记已被整理进多篇日记，请先进入目标日记后再继续追加。'); return }
  if (sorted.length && journalIds.length !== 1) { props.warning('暂时无法确认要追加到哪篇日记，请刷新页面后重试。'); return }
  let replace = false
  if (sorted.length) { try { await props.composeConfirm(`这一天有 ${sorted.length} 条已经整理过了。追加会把新的接在正文后面，替换会重新生成整篇。`) } catch (action) { if (action === 'close') return; replace = true } }
  composing.value = `${group.day}${useAi ? '-ai' : ''}`
  try { const result = await momentApi.compose({ tripId: tripId.value, day: group.day, journalId: journalIds[0] || null, replace, useAi }); await load(); const parts = [`已整理 ${result.momentCount} 条随手记`]; if (result.photoCount) parts.push(`${result.photoCount} 张照片`); props.message(parts.join('、') + (useAi ? (result.polished ? '，文字已润色' : '，这次用的是原文') : '')); await router.push(`/journals/${result.journalId}`) }
  catch (error) { props.fail(error) } finally { composing.value = '' }
}

watch(tripId, value => { void router.replace({ path: '/moments', query: value ? { tripId: String(value) } : {} }); if (value) localStorage.setItem(lastTripKey, String(value)); void load(); void refreshPending() })
const onOnline = () => { online.value = true; if (!props.session.offline) void syncPending() }
const onOffline = () => { online.value = false; void refreshPending() }
const onSessionReady = () => { if (props.session.user && !props.session.offline) void syncPending() }
onMounted(async () => { await loadTrips(); await Promise.all([load(), refreshPending()]); window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline); window.addEventListener('travel-session-ready', onSessionReady); if (navigator.onLine) void syncPending(); try { aiAvailable.value = (await momentApi.aiStatus()).available } catch { aiAvailable.value = false } })
onBeforeUnmount(() => { closeRoute(); draftPreviews.value.forEach(item => URL.revokeObjectURL(item.url)); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); window.removeEventListener('travel-session-ready', onSessionReady) })
</script>

<template>
  <div class="moments-page"><div class="page-head"><div><h2>随手记</h2><p>路上看到什么就记一条，晚上一键整理成日记。</p></div><el-select v-model="tripId" filterable placeholder="选择旅行" class="moments-trip"><el-option v-for="item in trips" :key="item.id" :label="item.title" :value="item.id" /></el-select></div>
    <section class="moment-composer panel"><el-input v-model="draft.content" type="textarea" :rows="3" resize="none" placeholder="现在看到了什么？一句话就够。" /><div v-if="draftPreviews.length" class="moment-shots"><figure v-for="(item, index) in draftPreviews" :key="item.url"><img :src="item.url" alt=""><button type="button" @click="dropDraftPhoto(index)">×</button></figure></div><div class="moment-composer-meta"><el-input v-model="draft.placeName" placeholder="在哪儿（可选）" class="moment-place" /><el-input v-model="draft.mood" placeholder="心情（可选）" maxlength="10" class="moment-mood" /></div><div class="moment-composer-actions"><button type="button" @click="capture"><b>📷</b><span>照片</span></button><button type="button" :class="{ active: draft.latitude != null }" :disabled="locating" @click="locate"><b>📍</b><span>{{ draft.latitude != null ? '已定位' : (locating ? '定位中' : '位置') }}</span></button><span class="moment-spacer"></span><el-button type="primary" :loading="saving" :disabled="!canSubmit" @click="submit">记下</el-button></div></section>
    <section v-if="pending.length" class="moment-pending panel" aria-live="polite"><header><div><strong>待同步</strong><small>{{ pending.length }} 条已安全保存在这台设备</small></div><span :class="{ active: syncing }">{{ !online ? '等待网络' : (syncing ? '正在同步' : '等待重试') }}</span></header><article v-for="item in pending" :key="item.clientId"><time>{{ timeLabel(item.payload.occurredAt, item.payload.occurredZoneId) }}</time><div><p v-if="item.payload.content">{{ item.payload.content }}</p><small><template v-if="item.photos.length">{{ item.photos.length }} 张照片 · </template>{{ item.error || (item.state === 'syncing' ? '正在同步' : '已保存在本机') }}</small></div><button v-if="item.state === 'failed'" type="button" @click="retryPending(item)">重试</button><button type="button" class="danger" @click="discardPending(item)">放弃</button></article></section>
    <div v-loading="loading" class="moment-timeline"><section v-for="group in grouped" :key="group.day" class="moment-day"><header><h3>{{ dayLabel(group.day) }}</h3><small>{{ group.items.length }} 条<template v-if="group.unsorted"> · {{ group.unsorted }} 条待整理</template></small><el-button size="small" plain @click="toggleRoute(group)">{{ routeDay === group.day ? '收起路线' : '看路线' }}</el-button><el-button size="small" type="primary" plain :loading="composing === group.day" @click="compose(group, false)">整理成日记</el-button><el-button v-if="aiAvailable" size="small" type="primary" :loading="composing === `${group.day}-ai`" @click="compose(group, true)">✦ AI 整理</el-button></header><div v-if="routeDay === group.day" class="moment-route"><div ref="routeEl" class="moment-route-map"></div><button type="button" class="moment-route-play" :class="{ playing: replaying }" @click="toggleReplay">{{ replaying ? '停止回放' : '▶ 回放这一天' }}</button></div>
      <article v-for="item in group.items" :key="item.id" class="moment-item" :class="{ 'is-sorted': item.sorted }"><time>{{ timeLabel(item.occurredAt, item.occurredZoneId) }}</time><div class="moment-body"><template v-if="editing?.id === item.id"><el-input v-model="editing.content" type="textarea" :rows="3" /><div class="moment-edit-meta"><el-input v-model="editing.placeName" placeholder="地点" /><el-input v-model="editing.mood" placeholder="心情" /></div><div class="moment-edit-actions"><el-button size="small" @click="editing = null">取消</el-button><el-button size="small" type="primary" @click="saveEdit">保存</el-button></div></template><template v-else><p v-if="item.content">{{ item.content }}</p><div v-if="item.photos.length" class="moment-shots"><figure v-for="photo in item.photos" :key="photo.id"><img :src="photo.thumbnailUrl" alt=""><button type="button" @click="removePhoto(item, photo.id)">×</button></figure></div><footer><span v-if="item.placeName">📍 {{ item.placeName }}</span><span v-else-if="item.latitude != null">📍 已记录坐标</span><span v-if="item.mood">· {{ item.mood }}</span><span v-if="item.sorted" class="moment-sorted">已整理</span><button type="button" @click="startEdit(item)">修改</button><button type="button" class="danger" @click="removeMoment(item)">删除</button></footer></template></div></article>
    </section><el-empty v-if="!loading && !grouped.length" :image-size="60" :description="tripId ? '这次旅行还没有随手记，上面写一条试试' : '先选一次旅行'" /></div>
    <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden @change="pickPhotos"><input ref="cameraInput" type="file" accept="image/*" capture="environment" hidden @change="pickPhotos"><template v-if="photoSheet"><div class="editor-sheet-backdrop" @click="photoSheet = false"></div><div class="photo-sheet"><button type="button" @click="photoSheet = false; cameraInput?.click()">拍照</button><button type="button" @click="photoSheet = false; photoInput?.click()">从相册选择</button><button type="button" class="cancel" @click="photoSheet = false">取消</button></div></template>
  </div>
</template>
