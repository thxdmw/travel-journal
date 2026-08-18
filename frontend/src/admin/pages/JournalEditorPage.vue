<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { budgetApi, type BudgetSummary, type Expense } from '@/api/budget'
import { itineraryApi, type ItineraryItem } from '@/api/itinerary'
import { journalApi } from '@/api/journal'
import { mediaApi } from '@/api/media'
import { templateApi, type JournalTemplate } from '@/api/template'
import { themeApi } from '@/api/theme'
import { tripApi, type TripOption } from '@/api/trip'
import * as localDraft from '@/draft/drafts'
import { dropPhoto, pendingPhotos, queuePhoto, reassignPhotos } from '@/draft/photos'
import { emptyDocument, normalize, wordCount } from '@/journal/document'
import { render as renderDocument } from '@/journal/render'
import { enhance, teardown } from '@/media/enhance'
import { createLocalPreview, releaseLocalPreview } from '@/media/local-preview'
import type { JsonObject } from '@/types/common'
import type { JournalEditorDraftRequest, JournalEntry, JournalStatus } from '@/types/journal'
import type { JournalBlock, JournalDocument } from '@/types/journal-block'
import type { MediaView } from '@/types/media'
import type { ThemeView } from '@/types/theme'
import type { Trip, TripStop } from '@/types/trip'
import { useRoute, useRouter } from 'vue-router'
import type { BlockEditorHandle, BlockUpload } from '@/admin/block-editor'
import JournalBlockEditor from '@/admin/JournalBlockEditor.vue'
import TemplateFieldInput, { type TemplateInput } from '@/admin/TemplateFieldInput.vue'

export interface JournalEditorPageDeps {
  message(text: string): void
  info(text: string): void
  warning(text: string): void
  fail(error: unknown): void
  confirm(text: string): Promise<unknown>
}

interface FormHandle { validate(): Promise<unknown> }
interface JournalForm {
  tripId: number | null, tripStopId: number | null, title: string, slug: string, excerpt: string,
  contentJson: JournalDocument, occurredOn: string, coverMediaId: number | null, status: JournalStatus,
  themeKey: string | null, templateId: number | null, templateVersion: number | null, tags: string[]
}
interface UploadTask extends BlockUpload { file: Blob, seq: number }
interface TravelContext { trip: Trip | null, stop: TripStop | null, stops: TripStop[], itinerary: ItineraryItem[], expenses: Expense[], budget: BudgetSummary | null, occurredOn: string }

const props = defineProps<JournalEditorPageDeps>()
const route = useRoute(); const router = useRouter()
function routeId() { const value = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id; return value === 'new' ? null : Number(value) }
function queryTripId() { return typeof route.query.tripId === 'string' ? Number(route.query.tripId) : null }
const id = ref<number | null>(routeId())
/*
 * 本机临时草稿 id。
 *
 * 打开「写日记」不再立刻去服务端开一篇空草稿——那样每点一次侧边栏就多一条垃圾记录。
 * 但作者在地铁里断着网也可能直接开始写，这时正文和照片必须先有个地方落脚，于是用一个
 * 负数当本机 id：负数不会和服务端主键撞车，photos 索引的 Number(journalId) 也照常工作。
 * 联网后创建真正的草稿，再把这一份整体改挂到真实 id 上。
 */
const localDraftId = ref<number | null>(null)
/*
 * 服务端那份草稿的版本号。
 *
 * 前端那条串行队列只管得住当前这个标签页。换台设备、多开一个标签页，或者 pagehide 的
 * keepalive 请求和正在路上的自动保存撞在一起，晚到的旧正文就会盖掉新写的那一段。
 * 每次保存都带上它，服务端认出版本对不上就返回 409，而不是默默覆盖。
 */
const revision = ref<number | null>(null)
/** 作者是否自己选过发生日期。没选过就以服务端站点时区的「今天」为准。 */
const occurredOnTouched = ref(false)
const conflicted = ref(false)
const trips = ref<TripOption[]>([]); const currentTrip = ref<Trip | null>(null); const stops = ref<TripStop[]>([]); const media = ref<MediaView[]>([])
const templates = ref<JournalTemplate[]>([]); const themes = ref<ThemeView[]>([])
const linkedItinerary = ref<ItineraryItem[]>([]); const linkedExpenses = ref<Expense[]>([]); const linkedBudget = ref<BudgetSummary | null>(null)
const pageLoading = ref(true); const saving = ref(false); const uploading = ref(false); const dirty = ref(false)
const formRef = ref<FormHandle | null>(null); const fileInput = ref<HTMLInputElement | null>(null); const cameraInput = ref<HTMLInputElement | null>(null)
const blockEditor = ref<BlockEditorHandle | null>(null); const photoSheet = ref(false)
const selectedMedia = ref<number[]>([]); const dragFrom = ref<number | null>(null); const dragOver = ref<number | null>(null)
const uploads = ref<UploadTask[]>([]); const mediaSort = ref('custom'); const metaOpen = ref(false); const mediaOpen = ref(false)
const metaCollapsed = ref(localStorage.getItem('travel-journal.editor-meta-collapsed') === 'on')
const templateDialog = ref(false); const selectedTemplate = ref<JournalTemplate | null>(null); const templateData = ref<Record<string, TemplateInput>>({}); const generating = ref(false)
const previewLink = ref(''); const autoSaveState = ref(''); const tagInput = ref(''); const previewOpen = ref(false); const articlePreviewEl = ref<HTMLElement | null>(null)
const allowTextInput = !window.matchMedia?.('(pointer: coarse)').matches
const form = reactive<JournalForm>({ tripId: queryTripId(), tripStopId: null, title: '', slug: '', excerpt: '', contentJson: emptyDocument(), occurredOn: '', coverMediaId: null, status: 'DRAFT', themeKey: null, templateId: null, templateVersion: null, tags: [] })
const required = (message: string, trigger = 'blur') => ({ required: true, message, trigger })
const rules = { title: [required('请填写日记标题')], slug: [required('请填写 Slug'), { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: '只能使用小写字母、数字和短横线', trigger: 'blur' }], occurredOn: [required('请选择发生日期', 'change')] }
const saveLabels: Record<string, string> = { saving: '保存中…', saved: '已保存', offline: '离线 · 待同步', failed: '保存失败 · 点击重试', local: '修改已暂存于本机' }
const wordTotal = computed(() => wordCount(form.contentJson)); const autoSaveLabel = computed(() => saveLabels[autoSaveState.value] || '')
const contextLine = computed(() => { const day = form.occurredOn ? form.occurredOn.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_match, _year, month, dayOfMonth) => `${Number(month)}月${Number(dayOfMonth)}日`) : ''; const city = stops.value.find(item => item.id === form.tripStopId)?.cityName; return [day, city || (form.tripId ? '' : '未归入旅行')].filter(Boolean).join(' · ') })
const autoExcerpt = computed(() => { const first = form.contentJson.blocks.find(block => block.type === 'paragraph' && block.data.text); return first ? String(first.data.text).slice(0, 80) : '' })
const excerptHint = computed(() => autoExcerpt.value ? `留空则用开头：${autoExcerpt.value.slice(0, 24)}…` : '摘要（留空自动取正文开头）')
const previewHtml = computed(() => previewOpen.value ? renderDocument(form.contentJson, media.value) : '')
const allSelected = computed(() => media.value.length > 0 && selectedMedia.value.length === media.value.length)
const templateBlocks = computed(() => Array.isArray(selectedTemplate.value?.definitionJson.blocks) ? selectedTemplate.value.definitionJson.blocks as unknown as Array<Record<string, unknown>> : [])
const travelContext = computed<TravelContext>(() => ({ trip: currentTrip.value, stop: stops.value.find(item => item.id === form.tripStopId) || null, stops: stops.value, itinerary: linkedItinerary.value, expenses: linkedExpenses.value, budget: linkedBudget.value, occurredOn: form.occurredOn }))
let travelDataRequest = 0; let localTimer: number | null = null; let remoteTimer: number | null = null; let fallbackTimer: number | null = null; let uploadSeq = 0
let saveChain: Promise<unknown> = Promise.resolve()
/** 首次输入、模板生成和图片上传可能同时到达；共享同一个创建 Promise，保证只开一篇草稿。 */
let draftCreation: Promise<boolean> | null = null
let userEdited = false

/** 本机快照和待上传照片挂在哪个 id 下：真实 id 优先，没有就用本机临时 id。 */
function storageId() { return id.value ?? localDraftId.value }
function ensureLocalDraft() { if (id.value == null && localDraftId.value == null) localDraftId.value = -Date.now(); return storageId() }
/** 上次没写完的本机临时草稿（指针记的是负数才算）。 */
function pendingLocalDraftId() { const last = localDraft.pointer(); const value = last == null ? NaN : Number(last.journalId); return Number.isFinite(value) && value < 0 ? value : null }

/*
 * 设备时区的今天，只用来在页面上先显示点什么。
 *
 * 真正写进库里的「今天」由后端的 SiteClock 按 app.site.timezone 决定：人在东京或者
 * 纽约的午夜前后，设备日期和站点日期会差一天，而这是同一个人的同一个站点，不该出现
 * 两个「今天」。所以作者没自己选日期时不把这个值发上去，草稿建好后用服务端的值回填。
 */
function deviceToday() { return new Date().toLocaleDateString('sv-SE') }
function statusLabel(status: JournalStatus) { return status === 'PUBLISHED' ? '已发布' : '草稿' }
function stopOfDay(day: string) { return stops.value.find(item => (!item.arrivalDate || item.arrivalDate <= day) && (!item.departureDate || item.departureDate >= day)) || null }
async function loadTravelData(value: number | null) {
  const request = ++travelDataRequest
  if (!value) { form.tripStopId = null; stops.value = []; currentTrip.value = null; linkedItinerary.value = []; linkedExpenses.value = []; linkedBudget.value = null; return }
  // 下拉只需要标题，但区块的数据关联要完整旅行（币种、日期等），单独取这一场就够
  const result = await Promise.all([tripApi.stops(value), itineraryApi.list(value), budgetApi.expenses(value), budgetApi.summary(value), tripApi.get(value)])
  if (request !== travelDataRequest) return
  ;[stops.value, linkedItinerary.value, linkedExpenses.value, linkedBudget.value, currentTrip.value] = result
  if (!stops.value.some(item => item.id === form.tripStopId)) form.tripStopId = null
}
function applyEntry(entry: JournalEntry) {
  revision.value = entry.revision ?? null
  Object.assign(form, { ...entry, excerpt: entry.excerpt || '', contentJson: normalize(entry.contentJson), occurredOn: entry.occurredOn || '', tags: entry.tags || [] })
}
/**
 * 保证服务端已经有这篇草稿。
 *
 * 打开页面不再调它——只有作者真的写了点什么（标题、正文、摘要、旅行、日期、标签、主题、
 * 图片、模板、手动保存、预览链接、发布）才需要一个服务端 id。首次输入、模板生成和图片上传
 * 常常在同一瞬间到达，所以共用一个创建 Promise，避免开出好几篇。
 *
 * @return 服务端草稿是否已就绪；离线或创建失败时返回 false，但本机那份不会丢
 */
async function ensureDraft(): Promise<boolean> {
  if (id.value) return true
  ensureLocalDraft()
  if (!navigator.onLine) { autoSaveState.value = 'offline'; return false }
  if (!draftCreation) {
    const task = createServerDraft()
    draftCreation = task
    const release = () => { if (draftCreation === task) draftCreation = null }
    void task.then(release, release)
  }
  return draftCreation
}
async function createServerDraft(): Promise<boolean> {
  try {
    const created = await journalApi.createDraft({
      tripId: form.tripId,
      // 作者自己选过日期才发上去；没选就交给站点时区决定，别让设备时区替它做主
      occurredOn: occurredOnTouched.value ? form.occurredOn : null,
    })
    // 只取服务端才有资格决定的字段。整份 applyEntry 会把刚敲进去的标题和正文用空白响应盖掉。
    id.value = created.id
    revision.value = created.revision ?? null
    if (!form.slug) form.slug = created.slug
    // 服务端按站点时区定的日期才是权威，回填覆盖掉之前按设备时区显示的那个
    if (!occurredOnTouched.value && created.occurredOn) form.occurredOn = created.occurredOn
    await adoptLocalDraft(created.id)
    const from = typeof route.query.from === 'string' ? route.query.from : undefined
    await router.replace({ path: `/journals/${created.id}`, query: from ? { from } : {} })
    autoSaveState.value = 'saving'
    return true
  } catch (error) { autoSaveState.value = navigator.onLine ? 'failed' : 'offline'; props.fail(error); return false }
}
/** 临时草稿转正：正文快照和待上传照片整体改挂到真实 id，先写新的再删旧的。 */
async function adoptLocalDraft(realId: number) {
  const localId = localDraftId.value
  localDraftId.value = null
  if (localId == null) return
  const saved = await localDraft.get(localId)
  if (saved?.form) await localDraft.put(realId, saved.form)
  await reassignPhotos(localId, realId)
  await localDraft.remove(localId)
}
/** 作者做了任何一件算数的编辑。第一次就把服务端草稿开出来，后续调用几乎零成本。 */
function noteUserEdit() {
  userEdited = true
  if (id.value == null) { ensureLocalDraft(); void ensureDraft() }
}
async function load() {
  pageLoading.value = true; let recovered = false
  try {
    // 旅行下拉走轻量选项接口：以前借用分页列表的前 100 条，旅行更多时会被静默截断
    const [tripOptions, availableTemplates, availableThemes] = await Promise.all([tripApi.options(), templateApi.list(true), themeApi.list(true)])
    trips.value = tripOptions; templates.value = availableTemplates; themes.value = availableThemes
    if (id.value) { applyEntry(await journalApi.get(id.value)); media.value = await mediaApi.list(id.value) }
    else form.occurredOn ||= deviceToday()
    if (form.tripId) await loadTravelData(form.tripId)
    if (!form.tripStopId) form.tripStopId = stopOfDay(form.occurredOn)?.id || null
    selectedTemplate.value = templates.value.find(item => item.id === form.templateId) || null
    if (selectedTemplate.value) selectTemplate(selectedTemplate.value)
    // 新建页面要找的是上次离线写了一半、还没来得及转正的那份本机草稿
    const restoreId = id.value ?? pendingLocalDraftId()
    const saved = await localDraft.get(restoreId)
    if (saved?.form && typeof saved.form === 'object' && saved.form !== null && JSON.stringify((saved.form as Partial<JournalForm>).contentJson) !== JSON.stringify(form.contentJson)) {
      try { await props.confirm('发现本机保存的编辑快照，是否恢复？'); Object.assign(form, saved.form); form.contentJson = normalize((saved.form as Partial<JournalForm>).contentJson); recovered = true } catch { /* 作者拒绝恢复 */ }
    }
    if (recovered && id.value == null && restoreId != null) { localDraftId.value = restoreId; userEdited = true }
    if (!recovered) await localDraft.remove(restoreId)
    dirty.value = recovered; if (recovered) autoSaveState.value = 'local'
  } catch (error) { props.fail(error) }
  finally { pageLoading.value = false }
  if (recovered) { scheduleLocal(); scheduleRemote() }
}
/**
 * 侧边栏「写日记」和编辑器共用一条 /journals/:id 路由，Vue 会复用组件而不是重新 setup。
 * 不把状态显式清一遍，从已有日记切过去就会带着上一篇的 id 和正文。
 */
async function resetToNew() {
  if (localTimer !== null) { clearTimeout(localTimer); localTimer = null }
  if (remoteTimer !== null) { clearTimeout(remoteTimer); remoteTimer = null }
  uploads.value.forEach(releaseUpload)
  uploads.value = []; media.value = []; selectedMedia.value = []
  id.value = null; localDraftId.value = null; draftCreation = null; userEdited = false
  previewLink.value = ''; autoSaveState.value = ''; dirty.value = false; saving.value = false
  selectedTemplate.value = null; templateData.value = {}; stops.value = []
  Object.assign(form, { tripId: queryTripId(), tripStopId: null, title: '', slug: '', excerpt: '', contentJson: emptyDocument(), occurredOn: '', coverMediaId: null, status: 'DRAFT' as JournalStatus, themeKey: null, templateId: null, templateVersion: null, tags: [] })
  await load()
  void resumePendingUploads()
}

const pendingFields = ['pendingKey', 'pendingKeys', 'pendingOrder', 'pendingResolved']
function cleanContent(): JournalDocument {
  const blocks = form.contentJson.blocks.filter(block => !(block.data.pendingKey && !block.data.mediaId) && !(Array.isArray(block.data.pendingKeys) && block.data.pendingKeys.length && !(block.data.mediaIds as unknown[] | undefined)?.length)).map(block => {
    if (!pendingFields.some(field => block.data[field] != null)) return block
    const copy = JSON.parse(JSON.stringify(block)) as JournalBlock; pendingFields.forEach(field => delete copy.data[field]); return copy
  })
  return { schemaVersion: 1, blocks }
}
function payload(contentJson: JournalDocument): JournalEditorDraftRequest { return { tripId: form.tripId, tripStopId: form.tripStopId, title: form.title, slug: form.slug, excerpt: form.excerpt || autoExcerpt.value, contentJson: contentJson as unknown as JsonObject, occurredOn: form.occurredOn, coverMediaId: form.coverMediaId, themeKey: form.themeKey, templateId: form.templateId, templateVersion: form.templateVersion, tags: form.tags } }
function serverBody(): JournalEditorDraftRequest { return { ...payload(cleanContent()), detachFromTrip: form.tripId == null, expectedRevision: revision.value } }
function localSnapshot() { return payload(normalize(JSON.parse(JSON.stringify(form.contentJson)))) }
function hasPendingContent() { return form.contentJson.blocks.some(block => block.data.pendingKey || (Array.isArray(block.data.pendingKeys) && block.data.pendingKeys.length)) }
async function reconcileLocalAfterServer(snapshot: JournalEditorDraftRequest) { const synchronized = JSON.stringify(snapshot) === JSON.stringify(serverBody()); if (synchronized && !hasPendingContent()) await localDraft.remove(storageId()); else await localDraft.put(storageId(), localSnapshot()); return synchronized }
/**
 * 服务端说「你手上这份不是最新的」。
 *
 * 绝不能自动覆盖，也绝不能丢掉本机这一份——作者刚敲的那几段只在这里。所以先把本机快照
 * 落盘，再让作者自己选：重新加载服务器版本，还是保留本机内容强制写上去。
 *
 * @return 是否是版本冲突（是的话调用方不用再走普通失败分支）
 */
async function handleConflict(error: unknown): Promise<boolean> {
  if (!isConflict(error) || conflicted.value) return isConflict(error)
  conflicted.value = true
  autoSaveState.value = 'local'
  await localDraft.put(ensureLocalDraft(), localSnapshot())
  try {
    await props.confirm('这篇日记在别的地方已经被改过了。点「确定」丢弃本机改动并加载服务器版本；点「取消」保留本机内容，稍后可以再次保存覆盖。')
    await reloadFromServer()
  } catch {
    // 作者选择留住自己写的：拿服务端最新版本号，下一次保存就能正常覆盖上去
    await refreshRevision()
  } finally {
    conflicted.value = false
  }
  return true
}
function isConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: number }).status === 409
}
/** 丢弃本机改动，整篇换成服务器上的版本。 */
async function reloadFromServer() {
  if (!id.value) return
  try {
    applyEntry(await journalApi.get(id.value))
    media.value = await mediaApi.list(id.value)
    await localDraft.remove(storageId())
    dirty.value = false
    autoSaveState.value = 'saved'
  } catch (error) { props.fail(error) }
}
/** 只取服务端最新版本号，正文原样保留本机这一份。 */
async function refreshRevision() {
  if (!id.value) return
  try { revision.value = (await journalApi.get(id.value)).revision ?? null }
  catch { /* 拿不到就等下一次保存再试 */ }
}
function enqueue<T>(task: () => Promise<T>): Promise<T> { const next = saveChain.then(task, task); saveChain = next.then(() => undefined, () => undefined); return next }
function flushEditor() { blockEditor.value?.flushInline() }
function scheduleLocal() { if (localTimer !== null) clearTimeout(localTimer); localTimer = window.setTimeout(() => { localTimer = null; void localDraft.put(ensureLocalDraft(), localSnapshot()) }, 600) }
function scheduleRemote() { if (remoteTimer !== null) clearTimeout(remoteTimer); remoteTimer = window.setTimeout(() => { remoteTimer = null; void autoSave() }, 3000) }
async function autoSave() {
  if (!dirty.value || form.status !== 'DRAFT') return false
  if (!navigator.onLine) { autoSaveState.value = 'offline'; return false }
  if (!id.value && !await ensureDraft()) return false
  return enqueue(async () => {
    if (!id.value || !dirty.value || form.status !== 'DRAFT') return false
    saving.value = true; autoSaveState.value = 'saving'; const snapshot = serverBody()
    try { const saved = await journalApi.saveDraft(id.value, snapshot); revision.value = saved.revision ?? null; if (await reconcileLocalAfterServer(snapshot)) dirty.value = false; autoSaveState.value = hasPendingContent() ? 'local' : 'saved'; return true }
    catch (error) { if (await handleConflict(error)) return false; autoSaveState.value = navigator.onLine ? 'failed' : 'offline'; return false }
    finally { saving.value = false }
  })
}
async function save(silent = false) {
  if (form.status === 'PUBLISHED') { if (!silent) props.info('已发布日记请使用“更新发布”，公开内容才会改变'); return false }
  if (!await ensureDraft()) return false
  flushEditor(); await nextTick(); if (remoteTimer !== null) { clearTimeout(remoteTimer); remoteTimer = null }
  return enqueue(async () => {
    if (!id.value) return false
    saving.value = true; autoSaveState.value = 'saving'; const snapshot = serverBody()
    try { const saved = await journalApi.saveDraft(id.value, snapshot); revision.value = saved.revision ?? null; if (await reconcileLocalAfterServer(snapshot)) dirty.value = false; autoSaveState.value = hasPendingContent() ? 'local' : 'saved'; if (!silent) props.message('草稿已保存'); return true }
    catch (error) { if (await handleConflict(error)) return false; autoSaveState.value = 'failed'; props.fail(error); return false }
    finally { saving.value = false }
  })
}
async function validatePublish() { try { await formRef.value?.validate(); return true } catch { metaCollapsed.value = false; return false } }
async function publish() { flushEditor(); await nextTick(); if (!await validatePublish() || !await save(true) || !id.value) return; await enqueue(async () => { try { const published = await journalApi.publish(id.value!, revision.value ?? 0); revision.value = published.revision ?? null; form.status = 'PUBLISHED'; dirty.value = false; if (hasPendingContent()) await localDraft.put(id.value, localSnapshot()); else await localDraft.remove(id.value); autoSaveState.value = hasPendingContent() ? 'local' : 'saved'; props.message('日记已发布') } catch (error) { if (await handleConflict(error)) return; props.fail(error) } }) }
async function updatePublished() { flushEditor(); await nextTick(); if (!await validatePublish() || !id.value) return; await enqueue(async () => { saving.value = true; const snapshot = serverBody(); try { const saved = await journalApi.update(id.value!, snapshot as Parameters<typeof journalApi.update>[1]); revision.value = saved.revision ?? null; if (await reconcileLocalAfterServer(snapshot)) dirty.value = false; autoSaveState.value = hasPendingContent() ? 'local' : 'saved'; props.message('公开文章已更新') } catch (error) { if (await handleConflict(error)) return; autoSaveState.value = 'failed'; props.fail(error) } finally { saving.value = false } }) }
async function unpublish() { if (!id.value) return; await enqueue(async () => { try { const draft = await journalApi.unpublish(id.value!, revision.value ?? 0); revision.value = draft.revision ?? null; form.status = 'DRAFT'; dirty.value = false; props.message('日记已撤回') } catch (error) { if (await handleConflict(error)) return; props.fail(error) } }) }

const uploadConcurrency = 3
/**
 * 给占位块配上本机小图预览。
 *
 * 不 await：作者选完照片应该立刻看到占位块和上传进度，而不是先等十张原图缩完。
 * 缩略本身在 local-preview 里限了并发，不会一次解码一堆原图。
 */
function attachPreviews(tasks: UploadTask[]) {
  tasks.forEach(task => {
    void createLocalPreview(task.file).then(url => {
      // 这张可能在缩略过程中已经被移除或上传完了，那就别再挂上去，直接扔掉
      if (!uploads.value.includes(task) || task.status === 'done') { releaseLocalPreview(url); return }
      releaseLocalPreview(task.preview)
      task.preview = url
    })
  })
}
/** 一张上传任务的收尾：预览 URL 只在这里释放，避免各条清理路径各写一遍。 */
function releaseUpload(task: UploadTask) {
  releaseLocalPreview(task.preview)
  task.preview = ''
}
async function upload(files?: FileList | File[] | null) {
  const list = Array.from(files || []).filter(file => file.type.startsWith('image/')); if (!list.length) return
  // 选照片本身就是一次有效编辑；离线时草稿开不出来，但正文占位和本机原图必须先落地
  noteUserEdit()
  const ready = await ensureDraft()
  const storage = ensureLocalDraft()
  const tasks = list.map(file => reactive<UploadTask>({ key: `up_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, name: file.name, file, preview: '', progress: 0, status: 'waiting', seq: uploadSeq++ }))
  uploads.value.push(...tasks); blockEditor.value?.insertPending(tasks)
  attachPreviews(tasks)
  const persisted = await Promise.all(tasks.map(task => queuePhoto(storage, task.key, task.file, task.name))); await localDraft.put(storage, localSnapshot())
  if (persisted.some(ok => !ok)) props.warning('部分照片无法写入离线存储，请保持页面打开直到上传完成')
  if (!ready) { props.info('照片已暂存在本机，联网后会自动继续上传'); return }
  await runUploadQueue(tasks)
}
async function resumePendingUploads() {
  const storage = storageId(); if (storage == null) return
  const queued = await pendingPhotos(storage); if (!queued.length) return
  const keys = new Set<string>(); form.contentJson.blocks.forEach(block => { if (typeof block.data.pendingKey === 'string') keys.add(block.data.pendingKey); if (Array.isArray(block.data.pendingKeys)) block.data.pendingKeys.forEach(key => { if (typeof key === 'string') keys.add(key) }) })
  const now = Date.now(); queued.filter(item => !keys.has(item.key) && now - item.queuedAt >= 86_400_000).forEach(item => void dropPhoto(item.key))
  const tasks = queued.filter(item => keys.has(item.key)).map(item => reactive<UploadTask>({ key: item.key, name: item.name, file: item.blob, preview: '', progress: 0, status: 'waiting', seq: uploadSeq++ }))
  attachPreviews(tasks)
  if (!tasks.length) return; uploads.value.push(...tasks)
  if (!id.value) { props.info(`有 ${tasks.length} 张照片还没传完，联网后会自动继续`); return }
  props.info(`有 ${tasks.length} 张照片上次没传完，正在继续`); await runUploadQueue(tasks)
}
async function runUploadQueue(tasks: UploadTask[]) {
  uploading.value = true; let cursor = 0
  await Promise.all(Array.from({ length: Math.min(uploadConcurrency, tasks.length) }, async () => { while (cursor < tasks.length) { const task = tasks[cursor++]; if (task) await sendUpload(task) } }))
  uploading.value = false; const failed = uploads.value.filter(task => task.status === 'failed').length; if (failed) props.warning(`${failed} 张照片没传上去，可以在正文里点重试`)
  if (tasks.some(task => task.status === 'done')) await syncMediaOrder(); uploads.value = uploads.value.filter(task => task.status !== 'done')
}
async function sendUpload(task: UploadTask) {
  if (!id.value) return; task.status = 'uploading'; task.progress = 0
  try {
    const body = new FormData(); body.append('file', task.file)
    // 上传的永远是原始文件；本机预览缩没缩过和这里无关
    const item = await mediaApi.upload(id.value, body, event => {
      if (!event.total) return
      // 只在整数百分比真的变了才写回，否则一次上传能触发上百次重绘
      const next = Math.min(99, Math.round(event.loaded * 100 / event.total))
      if (next !== task.progress) task.progress = next
    })
    const at = media.value.findIndex(existing => Number((existing as MediaView & { uploadSeq?: number }).uploadSeq) > task.seq)
    const stamped = Object.assign(item, { uploadSeq: task.seq })
    if (at < 0) media.value.push(stamped); else media.value.splice(at, 0, stamped)
    task.status = 'done'; task.progress = 100
    blockEditor.value?.resolvePending(task.key, item.id)
    await dropPhoto(task.key)
    // 必须等 DOM 换成服务端缩略图再撤销本机 URL，否则中间会有一帧空图闪过
    await nextTick()
    releaseUpload(task)
  }
  catch { task.status = 'failed' }
}
async function syncMediaOrder() { if (!id.value || !media.value.length || media.value.some(item => item.relationId == null)) return; try { await mediaApi.reorder(id.value, media.value.map(item => item.relationId!)) } catch { /* 下次排序重试 */ } }
function retryUpload(key: string) { const task = uploads.value.find(item => item.key === key); if (task?.status === 'failed') void runUploadQueue([task]) }
function discardUpload(key: string) { const task = uploads.value.find(item => item.key === key); if (task) releaseUpload(task); uploads.value = uploads.value.filter(item => item.key !== key); void dropPhoto(key) }
function onOnline() { void resumeAfterOnline() }
/** 出了地铁：先把本机临时草稿转正（只转一次），再续传卡住的照片和没保存的正文。 */
async function resumeAfterOnline() {
  if (!id.value && userEdited) await ensureDraft()
  const stalled = uploads.value.filter(task => task.status === 'failed' || task.status === 'waiting')
  if (stalled.length && id.value) void runUploadQueue(stalled)
  if (dirty.value) void autoSave()
}
function picked(event: Event) { const input = event.target as HTMLInputElement; void upload(input.files); input.value = '' }
function capture() { if (window.matchMedia('(pointer:coarse)').matches) photoSheet.value = true; else fileInput.value?.click() }
function dropped(event: DragEvent) { void upload(event.dataTransfer?.files) }
function pasted(event: ClipboardEvent) { const files = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith('image/')); if (files.length) { event.preventDefault(); void upload(files) } }
async function setCover(item: MediaView) {
  if (form.status === 'PUBLISHED') { form.coverMediaId = item.id; props.message('已选择封面，点击“更新发布”后生效'); return }
  if (!id.value) return
  try {
    /*
     * 设封面会推进服务端的 revision，所以必须把新版本号接回来。
     *
     * 不接的话，紧接着 form.coverMediaId 的变化会触发自动保存，而它带的还是设封面之前
     * 的版本号——作者刚点完封面，三秒后就收到一个「这篇日记在别处已经被改过」，
     * 而那个「别处」正是他自己。
     */
    const result = await mediaApi.setCover(id.value, item.id, revision.value ?? 0)
    revision.value = result.revision
    form.coverMediaId = item.id
    props.message('封面已更新')
  } catch (error) { if (await handleConflict(error)) return; props.fail(error) }
}
async function saveCaption(item: MediaView) { if (item.relationId == null) return; try { await mediaApi.updateCaption(item.relationId, item.caption || ''); props.message('图注已保存') } catch (error) { props.fail(error) } }
/*
 * 删一张图。
 *
 * 删的如果是封面，服务端会一并清空封面并推进 revision，所以要把返回的版本号接回来——
 * 理由和 setCover 那边一样：不接的话，紧接着 form.coverMediaId 归 null 触发的自动保存
 * 带的还是删之前的版本号，作者会收到一个由他自己造成的 409。
 */
async function removeMedia(item: MediaView) { if (item.relationId == null) return; try { await props.confirm('确定删除这张图片吗？正文仍在使用时系统会拒绝删除。'); const result = await mediaApi.remove(item.relationId); revision.value = result.revision; media.value = media.value.filter(existing => existing.relationId !== item.relationId); if (form.coverMediaId === item.id) form.coverMediaId = null } catch (error) { if (error !== 'cancel' && error !== 'close') props.fail(error) } }
function toggleSelect(item: MediaView) { selectedMedia.value = selectedMedia.value.includes(item.id) ? selectedMedia.value.filter(id => id !== item.id) : [...selectedMedia.value, item.id] }
function toggleSelectAll() { selectedMedia.value = allSelected.value ? [] : media.value.map(item => item.id) }
function insertSelected() { const ids = media.value.filter(item => selectedMedia.value.includes(item.id)).map(item => item.id); mediaOpen.value = false; blockEditor.value?.insertMedia(ids, ids.length > 1 ? 'gallery' : 'image') }
function onDragStart(index: number) { dragFrom.value = index } function onDragOver(index: number) { if (dragFrom.value !== null && dragFrom.value !== index) dragOver.value = index } function onDragEnd() { dragFrom.value = null; dragOver.value = null }
async function onDrop(index: number) { const from = dragFrom.value; onDragEnd(); if (from === null || from === index || !id.value) return; const before = [...media.value]; const next = [...before]; const moved = next.splice(from, 1)[0]; if (!moved) return; next.splice(index, 0, moved); media.value = next; try { if (next.some(item => item.relationId == null)) return; await mediaApi.reorder(id.value, next.map(item => item.relationId!)) } catch (error) { media.value = before; props.fail(error) } }
async function applyMediaSort(mode: string) { if (!id.value || mode === 'custom') return; try { if (mode === 'capture') { const count = await mediaApi.sortByCaptureTime(id.value); media.value = await mediaApi.list(id.value); props.message(`已按拍摄时间重排 ${count} 张图片`) } else { media.value = [...media.value].sort((a, b) => a.id - b.id); await syncMediaOrder(); props.message('已按上传顺序排列') }; selectedMedia.value = [] } catch (error) { props.fail(error) } }
async function removeSelected() { const targets = media.value.filter(item => selectedMedia.value.includes(item.id)); if (!targets.length) return; try { await props.confirm(`确定删除选中的 ${targets.length} 张图片吗？正文仍在使用的图片不会被删除。`) } catch { return }; let removed = 0; let failed = 0; for (const item of targets) { if (item.relationId == null) continue; try { const result = await mediaApi.remove(item.relationId); revision.value = result.revision; media.value = media.value.filter(existing => existing.id !== item.id); if (form.coverMediaId === item.id) form.coverMediaId = null; removed++ } catch { failed++ } }; selectedMedia.value = []; if (removed) props.message(`已删除 ${removed} 张图片`); if (failed) props.warning(`${failed} 张图片仍被正文使用，未删除`) }

function selectTemplate(item: JournalTemplate) { selectedTemplate.value = item; templateData.value = {}; const blocks = Array.isArray(item.definitionJson.blocks) ? item.definitionJson.blocks as unknown as Array<Record<string, unknown>> : []; blocks.forEach(block => { const key = String(block.id); templateData.value[key] = {}; if (block.type === 'trip-info') templateData.value[key] = { weather: '', mood: '' }; else if (['text', 'textarea', 'quote'].includes(String(block.type))) templateData.value[key] = { value: '' }; else if (block.type === 'rating') templateData.value[key] = { value: 0, comment: '' }; else if (block.type === 'image') templateData.value[key] = { mediaIds: null }; else if (block.type === 'gallery') templateData.value[key] = { mediaIds: [] } }) }
function templateInput(block: Record<string, unknown>): TemplateInput { return templateData.value[String(block.id)] || {} }
function updateTemplateInput(block: Record<string, unknown>, value: TemplateInput) { templateData.value[String(block.id)] = value }
function openTemplate() { if (!form.tripId) { metaCollapsed.value = false; metaOpen.value = true; props.info('模板会读取城市、行程等旅行数据；请先选择所属旅行，也可以直接在正文中开始写。'); return }; templateDialog.value = true; if (selectedTemplate.value) selectTemplate(selectedTemplate.value); else if (templates.value[0]) selectTemplate(templates.value[0]) }
async function generateFromTemplate() { if (!selectedTemplate.value || !form.tripId) return; if (form.contentJson.blocks.length) try { await props.confirm('使用模板会替换当前正文，是否继续？') } catch { return }; if (!await ensureDraft()) return; generating.value = true; try { const result = await templateApi.generate(selectedTemplate.value.id, { journalId: id.value, tripId: form.tripId, tripStopId: form.tripStopId, occurredOn: form.occurredOn, data: templateData.value as unknown as JsonObject }); form.contentJson = normalize(result.contentJson); form.templateId = result.templateId; form.templateVersion = result.templateVersion; templateDialog.value = false; if (result.skippedBlocks.length) props.info(`没有数据，已跳过：${result.skippedBlocks.join('、')}`) } catch (error) { props.fail(error) } finally { generating.value = false } }
async function makePreviewLink() { if (!await save(true) || !id.value) return; try { const value = await journalApi.createPreviewLink(id.value); previewLink.value = value.url || `${location.origin}/#/preview/${value.token}`; await navigator.clipboard?.writeText(previewLink.value); props.message('预览链接已复制') } catch (error) { props.fail(error) } }
function openPublished() { if (form.slug) window.open(`${location.origin}/#/journals/${encodeURIComponent(form.slug)}`, '_blank', 'noopener') }
function addTag() { const value = tagInput.value.trim(); if (value && !form.tags.includes(value)) form.tags.push(value); tagInput.value = '' } function removeTag(value: string) { form.tags = form.tags.filter(tag => tag !== value) }
function backToTrip() { if (!form.tripId) { void router.push('/'); return }; const from = typeof route.query.from === 'string' && ['overview', 'stops', 'itinerary', 'budget', 'expenses', 'journals', 'settings'].includes(route.query.from) ? route.query.from : 'journals'; void router.push({ path: `/trips/${form.tripId}`, query: { tab: from } }) }
function openArticlePreview() { blockEditor.value?.flushInline(); metaOpen.value = false; void nextTick(() => { previewOpen.value = true }) }
function keepaliveSave() { if (!id.value) return; const token = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1]; const headers: Record<string, string> = { 'Content-Type': 'application/json' }; if (token) headers['X-XSRF-TOKEN'] = decodeURIComponent(token); void fetch(`/api/admin/journals/${id.value}/draft`, { method: 'PATCH', credentials: 'include', keepalive: true, headers, body: JSON.stringify(serverBody()) }).catch(() => undefined) }
function flushAll(closing: boolean) { if (pageLoading.value) return; flushEditor(); if (localTimer !== null) { clearTimeout(localTimer); localTimer = null }; if (!dirty.value) return; void localDraft.put(ensureLocalDraft(), localSnapshot()); if (remoteTimer !== null) { clearTimeout(remoteTimer); remoteTimer = null }; if (!id.value || form.status !== 'DRAFT' || !navigator.onLine) return; if (!closing) { void autoSave(); return }
  // 已经有一次保存在路上时，keepalive 这条带的是同一个旧版本号，到达服务端只会拿到 409。
  // 本机快照上面已经写过了，这时候什么都不发才是对的。
  if (!saving.value) keepaliveSave() }
function onPageHide() { flushAll(true) } function onHidden() { if (document.visibilityState === 'hidden') flushAll(false) }

watch(previewHtml, () => void nextTick(() => { teardown(articlePreviewEl.value); enhance(articlePreviewEl.value) }))
watch(previewOpen, value => { if (!value) teardown(articlePreviewEl.value) })
watch(() => form.tripId, value => { void loadTravelData(value).catch(props.fail) })
watch(() => form.occurredOn, value => { if (value && !form.slug) form.slug = `journal-${value.replaceAll('-', '')}-${Date.now().toString().slice(-5)}` })
watch(metaCollapsed, value => localStorage.setItem('travel-journal.editor-meta-collapsed', value ? 'on' : 'off'))
watch(form, () => { if (pageLoading.value) return; dirty.value = true; noteUserEdit(); if (form.status === 'PUBLISHED') { autoSaveState.value = 'local'; scheduleLocal(); return }; scheduleLocal(); scheduleRemote() }, { deep: true })
// 侧边栏「写日记」落在同一条路由上，组件会被复用；不显式重置就会带着上一篇的 id 继续写
watch(() => route.params.id, async next => { const value = Array.isArray(next) ? next[0] : next; if (value === 'new' && (id.value !== null || userEdited || dirty.value)) await resetToNew() })
onMounted(async () => { await load(); void resumePendingUploads(); fallbackTimer = window.setInterval(() => void autoSave(), 45_000); window.addEventListener('pagehide', onPageHide); document.addEventListener('visibilitychange', onHidden); window.addEventListener('online', onOnline) })
onBeforeUnmount(async () => {
  if (fallbackTimer !== null) clearInterval(fallbackTimer)
  window.removeEventListener('pagehide', onPageHide)
  document.removeEventListener('visibilitychange', onHidden)
  window.removeEventListener('online', onOnline)
  uploads.value.forEach(releaseUpload)
  if (pageLoading.value) return
  flushEditor()
  if (localTimer !== null) { clearTimeout(localTimer); localTimer = null }
  if (remoteTimer !== null) { clearTimeout(remoteTimer); remoteTimer = null }
  if (!dirty.value) return
  const local = localSnapshot()
  // 还没转正的临时草稿也要留在本机，否则「离线写了两段就切走」等于白写
  await localDraft.put(ensureLocalDraft(), local)
  const journalId = id.value
  if (!journalId || form.status !== 'DRAFT' || !navigator.onLine) return
  const snapshot = serverBody()
  try {
    await enqueue(() => journalApi.saveDraft(journalId, snapshot))
    await reconcileLocalAfterServer(snapshot)
  } catch {
    await localDraft.put(journalId, local)
  }
})
</script>

<template>
  <div v-loading="pageLoading" class="editor-page" element-loading-text="正在打开日记…" @paste="pasted">
    <div class="editor-top"><el-button link class="editor-back" @click="backToTrip">←<em>返回</em></el-button><div class="editor-top-state"><button type="button" class="editor-save-state" :class="`is-${autoSaveState}`" :disabled="autoSaveState !== 'failed'" @click="autoSave">{{ autoSaveLabel || statusLabel(form.status) }}</button><span class="editor-context">{{ contextLine }}</span></div><span class="word-count">{{ wordTotal }} 字</span>
      <div class="editor-actions"><el-button @click="openTemplate">{{ form.templateId ? '填写模板' : '从模板开始' }}</el-button><template v-if="form.status === 'PUBLISHED'"><el-button @click="openPublished">查看文章</el-button><el-button @click="unpublish">撤回</el-button><el-button type="primary" :loading="saving" :disabled="!dirty" @click="updatePublished">更新发布</el-button></template><template v-else><el-button @click="openArticlePreview">预览全文</el-button><el-button :disabled="!id" @click="makePreviewLink">预览链接</el-button><el-button type="primary" @click="publish">发布日记</el-button></template></div>
      <button type="button" class="editor-preview-btn" aria-label="预览全文" @click="openArticlePreview">👁</button><button type="button" class="editor-more" aria-label="日记信息与更多操作" @click="metaOpen = true">···</button></div>
    <button type="button" class="editor-meta-toggle" :aria-expanded="!metaCollapsed" @click="metaCollapsed = !metaCollapsed"><span>{{ metaCollapsed ? (form.title || '日记信息') : '收起日记信息' }}</span><i class="editor-meta-toggle__chev" /></button>
    <el-form ref="formRef" :model="form" :rules="rules" class="editor-meta-group editor-meta-form" :class="{ collapsed: metaCollapsed, 'is-open': metaOpen }"><div class="editor-meta-inner"><div class="editor-meta"><el-form-item prop="title"><el-input v-model="form.title" placeholder="日记标题（发布前必填）" /></el-form-item><el-form-item prop="tripId"><el-select v-model="form.tripId" filterable clearable placeholder="所属旅行（可选）"><el-option v-for="item in trips" :key="item.id" :label="item.title" :value="item.id" /></el-select></el-form-item><el-form-item v-if="form.tripId"><el-select v-model="form.tripStopId" clearable placeholder="城市（可选）"><el-option v-for="item in stops" :key="item.id" :label="item.cityName" :value="item.id" /></el-select></el-form-item><el-form-item prop="occurredOn"><el-date-picker v-model="form.occurredOn" :editable="allowTextInput" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="发生日期（必填）" @change="occurredOnTouched = true" /></el-form-item></div>
      <div class="editor-meta editor-meta-secondary"><el-form-item><el-input v-model="form.excerpt" maxlength="500" :placeholder="excerptHint" /></el-form-item><el-form-item><el-select v-model="form.themeKey" clearable placeholder="继承旅行 / 全站主题"><el-option v-for="item in themes" :key="item.themeKey" :label="item.name" :value="item.themeKey" /></el-select></el-form-item></div>
      <div class="editor-tags"><el-tag v-for="tag in form.tags" :key="tag" closable disable-transitions @close="removeTag(tag)">{{ tag }}</el-tag><el-input v-model="tagInput" size="small" class="tag-input" placeholder="加标签，回车确认" @keyup.enter="addTag" /></div><details class="editor-advanced"><summary>高级</summary><el-form-item prop="slug" label="网址 slug"><el-input v-model="form.slug" placeholder="留空由系统生成" /></el-form-item></details><div v-if="previewLink" class="preview-link-bar"><span>预览链接：</span><code>{{ previewLink }}</code></div>
      <div class="editor-sheet-actions"><el-button @click="openArticlePreview">预览全文</el-button><el-button @click="metaOpen = false; openTemplate()">{{ form.templateId ? '填写模板' : '从模板开始' }}</el-button><template v-if="form.status === 'PUBLISHED'"><el-button @click="openPublished">查看文章</el-button><el-button @click="unpublish">撤回</el-button><el-button type="primary" :loading="saving" :disabled="!dirty" @click="metaOpen = false; updatePublished()">更新发布</el-button></template><template v-else><el-button :disabled="!id" @click="makePreviewLink">预览链接</el-button><el-button type="primary" @click="metaOpen = false; publish()">发布日记</el-button></template></div></div></el-form>
    <div v-if="metaOpen" class="editor-sheet-backdrop" @click="metaOpen = false" />
    <div class="editor-grid block-editor-layout"><section class="editor-column editor-column--write"><div class="editor-label">日记内容 <small>点击区块之间的 ＋ 添加</small></div><JournalBlockEditor ref="blockEditor" v-model="form.contentJson" :media="media" :uploads="uploads" :travel-context="travelContext" :notify="props.message" @retry-upload="retryUpload" @discard-upload="discardUpload" /></section>
      <aside class="editor-column media-column" :class="{ 'is-open': mediaOpen }"><div class="editor-label">图片管理 <small>点击图片可放大预览</small><button type="button" class="media-close" @click="mediaOpen = false">收起</button></div><label class="upload-box" :class="{ uploading }" @dragover.prevent @drop.prevent="dropped"><input ref="fileInput" type="file" multiple accept="image/jpeg,image/png,image/webp" @change="picked"><strong>{{ uploading ? '正在上传…' : '选择、拖放或粘贴图片' }}</strong><span>JPEG / PNG / WebP · 上传后可直接配置版式</span><el-button type="primary" plain :disabled="uploading" @click.prevent="fileInput?.click()">＋ 上传图片</el-button></label>
        <div class="media-manager-toolbar"><el-checkbox :model-value="allSelected" @change="toggleSelectAll">全选</el-checkbox><el-select v-model="mediaSort" size="small" class="media-sort" @change="applyMediaSort"><el-option label="按拍摄时间" value="capture" /><el-option label="按上传顺序" value="upload" /><el-option label="自定义顺序" value="custom" /></el-select><small class="hide-on-mobile">电脑上可拖动调整</small><el-button v-if="selectedMedia.length" type="primary" size="small" @click="insertSelected">插入选中（{{ selectedMedia.length }}）</el-button><el-button v-if="selectedMedia.length" link type="danger" size="small" @click="removeSelected">删除选中</el-button></div>
        <div class="media-side"><article v-for="(item, index) in media" :key="item.relationId || item.id" class="media-item" :class="{ 'is-selected': selectedMedia.includes(item.id), 'is-drag-over': dragOver === index }" draggable="true" @dragstart="onDragStart(index)" @dragover.prevent="onDragOver(index)" @dragend="onDragEnd" @drop.prevent="onDrop(index)"><el-checkbox class="media-item-check" :model-value="selectedMedia.includes(item.id)" @change="toggleSelect(item)" /><el-image :src="item.thumbnailUrl || item.displayUrl" :preview-src-list="[item.displayUrl]" :alt="item.caption || item.filename" fit="cover" preview-teleported /><div class="media-item-main"><el-input v-model="item.caption" class="media-item-caption" size="small" placeholder="图注（留空则不显示）" @change="saveCaption(item)" /><div class="media-item-actions"><el-button link size="small" @click="mediaOpen = false; blockEditor?.insertMedia(item.id, 'image')">插入</el-button><el-button link size="small" @click="setCover(item)">{{ form.coverMediaId === item.id ? '当前封面' : '设封面' }}</el-button><el-button link type="danger" size="small" @click="removeMedia(item)">删除</el-button></div></div></article><el-empty v-if="!media.length" :image-size="52" description="还没有图片" /></div></aside><div v-if="mediaOpen" class="editor-sheet-backdrop" @click="mediaOpen = false" /></div>
    <nav class="editor-toolbar" aria-label="写作工具"><button type="button" @click="blockEditor?.openCatalog()"><b>＋</b><em>内容</em></button><button type="button" :disabled="uploading" @click="capture"><b>📷</b><em>照片</em></button><button type="button" @click="blockEditor?.insertQuick('location-card')"><b>📍</b><em>地点</em></button><button type="button" @click="blockEditor?.insertQuick('heading')"><b>H</b><em>标题</em></button><button type="button" @click="blockEditor?.insertQuick('quote')"><b>”</b><em>引用</em></button><button type="button" @click="mediaOpen = true"><b>🖼</b><em>{{ media.length }}</em></button></nav>
    <!-- eslint-disable vue/no-v-html -- 正文 HTML 只由已转义且过滤 URL 的 JournalBlocks 渲染器生成。 -->
    <el-dialog v-model="previewOpen" title="文章预览" width="min(900px,96vw)" class="article-preview-dialog" append-to-body align-center destroy-on-close><p class="article-preview-note">下面是这篇日记发布出去之后读者看到的样子，用的是和公开页面同一套渲染。</p><article ref="articlePreviewEl" class="preview journal-document article-preview-body"><header class="article-preview-head"><p v-if="contextLine">{{ contextLine }}</p><h1 :class="{ empty: !form.title }">{{ form.title || '（还没有标题，发布前需要填）' }}</h1><div v-if="form.tags.length" class="article-preview-tags"><span v-for="tag in form.tags" :key="tag">{{ tag }}</span></div></header><div v-if="previewHtml" v-html="previewHtml" /><p v-else class="article-preview-empty">正文还是空的，写点什么再回来看看。</p></article><template #footer><el-button @click="previewOpen = false">继续写</el-button><el-button v-if="form.status !== 'PUBLISHED'" type="primary" @click="previewOpen = false; publish()">发布日记</el-button></template></el-dialog>
    <!-- eslint-enable vue/no-v-html -->
    <input ref="cameraInput" type="file" accept="image/*" capture="environment" hidden @change="picked"><template v-if="photoSheet"><div class="editor-sheet-backdrop" @click="photoSheet = false" /><div class="photo-sheet"><button type="button" @click="photoSheet = false; cameraInput?.click()">拍照</button><button type="button" @click="photoSheet = false; fileInput?.click()">从相册选择</button><button type="button" class="cancel" @click="photoSheet = false">取消</button></div></template>
    <el-dialog v-model="templateDialog" title="用模板开始写作" width="min(980px,96vw)"><div class="template-writing"><aside class="template-choices"><button v-for="item in templates" :key="item.id" type="button" :class="{ active: selectedTemplate?.id === item.id }" @click="selectTemplate(item)"><strong>{{ item.name }}</strong><span>{{ item.description }}</span><small>{{ item.builtin ? '系统模板' : '我的模板' }}</small></button></aside><section v-if="selectedTemplate" class="template-fields"><header><h3>{{ selectedTemplate.name }}</h3><p>模板会一次生成可继续编辑的内容块，不会与正文长期绑定。</p></header><div v-for="block in templateBlocks" :key="String(block.id)" class="template-field"><TemplateFieldInput :model-value="templateInput(block)" :block="block" :media="media" @update:model-value="updateTemplateInput(block, $event)" /></div></section></div><template #footer><el-button @click="templateDialog = false">取消</el-button><el-button type="primary" :loading="generating" @click="generateFromTemplate">生成内容块</el-button></template></el-dialog>
  </div>
</template>
