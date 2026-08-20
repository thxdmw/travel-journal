<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { authApi } from '@/api/auth'
import { themeApi, type SiteThemeState, type ThemeRequest } from '@/api/theme'
import { createThemeCardPreviewMessage } from '@/admin/theme-card-preview-message'
import { apply } from '@/theme/theme'
import { DEFAULT_BASE } from '@/theme/tokens'
import type { AdminInfo } from '@/types/auth'
import type { JsonObject, JsonValue } from '@/types/common'
import type { ThemeView } from '@/types/theme'
import {
  colorFields, defaultDefinition, settingGroups, stickerAreas, stickerAssets,
  type PreviewScene, type SettingField, type SettingGroup, type StudioDefinition, type StudioSticker,
} from '@/admin/theme-studio-config'

export interface ThemeStudioPageDeps {
  session: { user: AdminInfo | null }
  updateUser(user: AdminInfo): void
  message(text: string): void
  fail(error: unknown): void
  confirm(text: string): Promise<unknown>
}

interface ThemeForm {
  name: string
  description: string
  baseThemeKey: string
  previewImageUrl: string
  enabled: boolean
  definitionJson: StudioDefinition
}
interface PreviewBox { scale: number, frameWidth: number, frameHeight: number, stageWidth: number, stageHeight: number }
interface DiffEntry { label: string, oldValue: JsonValue | undefined, newValue: JsonValue | undefined }
interface Snapshot { name: string, description: string, baseThemeKey: string, previewImageUrl: string, enabled: boolean, definitionJson: StudioDefinition }

const props = defineProps<ThemeStudioPageDeps>()
const themes = ref<ThemeView[]>([])
const siteState = ref<SiteThemeState | null>(null)
const changing = ref('')
const saving = ref(false)
const editor = ref(false)
const editing = ref<number | null>(null)
const editingBuiltin = ref(false)
const editingSource = ref<ThemeView | null>(null)
const previewFrame = ref<HTMLIFrameElement | null>(null)
const previewWrap = ref<HTMLElement | null>(null)
const previewMode = ref<'desktop' | 'mobile'>('desktop')
const previewScene = ref<PreviewScene>('home')
const importInput = ref<HTMLInputElement | null>(null)
const heroInput = ref<HTMLInputElement | null>(null)
const heroUploading = ref(false)
const history = ref<string[]>([])
const historyIndex = ref(-1)
const diffDialog = ref(false)
const diffTarget = ref<ThemeView | null>(null)
let historyTimer: number | null = null
let restoring = false
let originalSnapshot = ''
let pendingHighlight: string | null = null
let previewObserver: ResizeObserver | null = null

const form = reactive<ThemeForm>({ name: '', description: '', baseThemeKey: DEFAULT_BASE, previewImageUrl: '', enabled: true, definitionJson: deep(defaultDefinition) })
const previewViewports = { desktop: { width: 1280, height: null }, mobile: { width: 390, height: 844 } } as const
const previewBox = reactive<PreviewBox>({ scale: 1, frameWidth: 1280, frameHeight: 800, stageWidth: 1280, stageHeight: 800 })
const previewSrc = computed(() => `/?theme-preview=1&scene=${previewScene.value}#/theme-preview-scene`)
const stageStyle = computed(() => ({ width: `${previewBox.stageWidth}px`, height: `${previewBox.stageHeight}px` }))
const frameStyle = computed(() => ({ width: `${previewBox.frameWidth}px`, height: `${previewBox.frameHeight}px`, transform: `scale(${previewBox.scale})` }))
const basicGroups = computed(() => settingGroups.filter(group => group.tier !== 'advanced'))
const advancedGroups = computed(() => settingGroups.filter(group => group.tier === 'advanced'))
const builtinThemes = computed(() => themes.value.filter(item => item.builtin))
const isAuto = computed(() => siteState.value?.mode !== 'FIXED')
const activeThemeKey = computed(() => siteState.value?.theme?.themeKey || props.session.user?.themeKey)
const seasonHint = computed(() => {
  if (!siteState.value) return ''
  const name = themes.value.find(item => item.themeKey === siteState.value?.seasonThemeKey)?.name
  return [siteState.value.season, name].filter(Boolean).join(' · ')
})
const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < history.value.length - 1)
const stickerItems = computed(() => form.definitionJson.stickers.items as StudioSticker[])
const heroUrl = computed(() => {
  const id = form.definitionJson.hero.mediaId
  return typeof id === 'number' ? `/api/media/${id}/display` : ''
})
const contrast = computed(() => {
  const ratio = contrastRatio(String(form.definitionJson.colors.text), String(form.definitionJson.colors.background))
  return { ratio: ratio.toFixed(2), ok: ratio >= 4.5 }
})
const sceneLabels: Record<PreviewScene, string> = { home: '首页', journal: '日记', map: '地图' }
const highlights: Record<string, string> = {
  colors: 'body, .hero', typography: '.journal-paragraph, .article-head h1', shape: '.journal-card, .stat', layout: '.home-page, .article',
  card: '.journal-card', background: '.home-page-shell, .page', image: '.journal-figure', gallery: '.journal-gallery', motion: '.journal-card',
  effects: 'body', map: '.map-box', decorations: '.journal-block', stickers: '.tj-sticker', dividers: '.journal-block--divider', ambient: 'body',
  blockStyles: '.journal-block--quote, .journal-block--callout, .journal-block--timeline', interactions: '.tj-sticker, .journal-figure', hero: '.hero, .hero-photo',
}

function deep<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function asJson(definition: StudioDefinition): JsonObject { return deep(definition) as unknown as JsonObject }
function completeDefinition(input?: JsonObject | StudioDefinition): StudioDefinition {
  const result = deep(defaultDefinition)
  const source = input as StudioDefinition | undefined
  Object.keys(result).forEach(section => {
    const target = result[section]
    if (target) Object.assign(target, source?.[section] || {})
  })
  return result
}
function isActive(item: ThemeView) { return !isAuto.value && activeThemeKey.value === item.themeKey }
function fieldScene(group: SettingGroup, field: SettingField): PreviewScene { return field.preview || group.preview }
function fieldDisabled(field: SettingField) { return Boolean(field.condition && !field.condition(form.definitionJson)) }
function settingValue(group: SettingGroup, field: SettingField) { return form.definitionJson[group.key]?.[field.key] }
function setSettingValue(group: SettingGroup, field: SettingField, value: unknown) {
  const section = form.definitionJson[group.key]
  if (section && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null)) section[field.key] = value
}
function updateSetting(group: SettingGroup, field: SettingField, value: unknown) { setSettingValue(group, field, value) }
function updateScheme(value: unknown) {
  setSettingValue({ key: 'colors', preview: 'home' }, { key: 'scheme' }, value)
  onFieldTouched({ key: 'colors', preview: 'home' }, { key: 'scheme' })
}
function updateColor(key: string, value: unknown) {
  if (typeof value === 'string' || value === null) form.definitionJson.colors[key] = value
  onFieldTouched({ key: 'colors', preview: 'home' }, { key })
}

async function load() {
  try { [themes.value, siteState.value] = await Promise.all([themeApi.list(false), themeApi.siteState()]) }
  catch (error) { props.fail(error) }
}
function measurePreview() {
  const wrap = previewWrap.value
  if (!wrap) return
  const styles = getComputedStyle(wrap)
  const available = wrap.clientWidth - parseFloat(styles.paddingLeft || '0') - parseFloat(styles.paddingRight || '0')
  const height = wrap.clientHeight - parseFloat(styles.paddingTop || '0') - parseFloat(styles.paddingBottom || '0')
  if (available <= 0 || height <= 0) return
  const viewport = previewViewports[previewMode.value]
  const scale = viewport.height ? Math.min(1, available / viewport.width, height / viewport.height) : Math.min(1, available / viewport.width)
  const frameHeight = viewport.height || height / scale
  Object.assign(previewBox, { scale, frameWidth: viewport.width, frameHeight, stageWidth: viewport.width * scale, stageHeight: frameHeight * scale })
}
function postPreview() {
  void nextTick(() => {
    try { previewFrame.value?.contentWindow?.postMessage({ type: 'travel-theme-preview', theme: { themeKey: 'preview', baseThemeKey: form.baseThemeKey, definitionJson: asJson(form.definitionJson) } }, location.origin) } catch { /* iframe 仍在换页 */ }
  })
}
function postCardPreview(event: Event, item: ThemeView) {
  const frame = event.currentTarget instanceof HTMLIFrameElement ? event.currentTarget.contentWindow : null
  try { frame?.postMessage(createThemeCardPreviewMessage(item), location.origin) } catch { /* iframe 仍在换页 */ }
}
function sendPreviewHighlight(selector: string | null) {
  void nextTick(() => { try { previewFrame.value?.contentWindow?.postMessage({ type: 'travel-theme-highlight', selector }, location.origin) } catch { /* iframe 仍在换页 */ } })
}
function onFieldTouched(group: SettingGroup, field: SettingField) {
  const scene = fieldScene(group, field); const selector = highlights[group.key] || null; pendingHighlight = selector
  if (previewScene.value !== scene) { previewScene.value = scene; return }
  pendingHighlight = null; sendPreviewHighlight(selector)
}
function previewLoaded() {
  postPreview()
  if (pendingHighlight) { const selector = pendingHighlight; pendingHighlight = null; window.setTimeout(() => sendPreviewHighlight(selector), 80) }
}

function snapshot() { return JSON.stringify({ name: form.name, description: form.description, baseThemeKey: form.baseThemeKey, previewImageUrl: form.previewImageUrl, enabled: form.enabled, definitionJson: form.definitionJson }) }
function assignSnapshot(value: string | Snapshot) {
  restoring = true
  const data = typeof value === 'string' ? JSON.parse(value) as Snapshot : value
  Object.assign(form, { name: data.name, description: data.description || '', baseThemeKey: data.baseThemeKey || DEFAULT_BASE, previewImageUrl: data.previewImageUrl || '', enabled: data.enabled !== false, definitionJson: completeDefinition(data.definitionJson) })
  void nextTick(() => { restoring = false; postPreview() })
}
function seedHistory() { originalSnapshot = snapshot(); history.value = [originalSnapshot]; historyIndex.value = 0 }
function pushHistory() {
  const value = snapshot(); if (value === history.value[historyIndex.value]) return
  history.value = history.value.slice(0, historyIndex.value + 1); history.value.push(value)
  if (history.value.length > 30) history.value.shift(); historyIndex.value = history.value.length - 1
}
function undo() { if (canUndo.value) assignSnapshot(history.value[--historyIndex.value] || originalSnapshot) }
function redo() { if (canRedo.value) assignSnapshot(history.value[++historyIndex.value] || originalSnapshot) }
function resetEditor() { assignSnapshot(originalSnapshot); history.value = [originalSnapshot]; historyIndex.value = 0 }
function changedPaths() {
  if (!originalSnapshot) return []
  const before = (JSON.parse(originalSnapshot) as Snapshot).definitionJson
  const paths: string[] = []
  Object.keys(defaultDefinition).forEach(section => {
    const keys = new Set([...Object.keys(before[section] || {}), ...Object.keys(form.definitionJson[section] || {})])
    keys.forEach(key => { if (JSON.stringify(before[section]?.[key]) !== JSON.stringify(form.definitionJson[section]?.[key])) paths.push(`${section}.${key}`) })
  })
  return paths
}

function openEditor(item?: ThemeView | null, forceNew = false) {
  const source = item || themes.value.find(theme => theme.themeKey === activeThemeKey.value) || themes.value[0]
  editing.value = forceNew ? null : source?.id || null; editingBuiltin.value = !forceNew && Boolean(source?.builtin); editingSource.value = forceNew ? null : source || null
  assignSnapshot({ name: forceNew ? '我的旅行主题' : source?.name || '我的旅行主题', description: source?.description || '', baseThemeKey: source?.baseThemeKey || DEFAULT_BASE, previewImageUrl: source?.previewImageUrl || '', enabled: true, definitionJson: completeDefinition(source?.definitionJson) })
  editor.value = true; void nextTick(() => { seedHistory(); postPreview() })
}
async function saveTheme() {
  saving.value = true
  try {
    const body: ThemeRequest = { name: form.name, description: form.description, baseThemeKey: form.baseThemeKey, previewImageUrl: form.previewImageUrl || null, enabled: form.enabled, definitionJson: asJson(form.definitionJson) }
    if (editingBuiltin.value) body.changedPaths = changedPaths()
    const saved = editing.value ? await themeApi.update(editing.value, body) : await themeApi.create(body)
    if (activeThemeKey.value === saved.themeKey) apply(saved)
    editor.value = false; await load(); props.message('主题已保存')
  } catch (error) { props.fail(error) }
  finally { saving.value = false }
}
async function selectTheme(item: ThemeView) {
  if (isActive(item)) return
  changing.value = item.themeKey
  try {
    const updated = await authApi.changeTheme(item.themeKey)
    if (props.session.user) props.updateUser({ ...props.session.user, ...updated })
    apply(item); siteState.value = await themeApi.siteState(); props.message(`主题已切换为“${item.name}”，季节变化不会再改动它`)
  } catch (error) { props.fail(error) }
  finally { changing.value = '' }
}
async function followSeason() {
  if (isAuto.value) return
  changing.value = '__auto__'
  try {
    const updated = await authApi.changeTheme(null, 'AUTO')
    if (props.session.user) props.updateUser({ ...props.session.user, ...updated })
    siteState.value = await themeApi.siteState(); apply(siteState.value.theme); props.message(`已切回跟随季节，当前是${seasonHint.value}`)
  } catch (error) { props.fail(error) }
  finally { changing.value = '' }
}
async function duplicateTheme(item: ThemeView) { try { const created = await themeApi.duplicate(item.id); await load(); openEditor(created); props.message('已复制主题，可以开始设计') } catch (error) { props.fail(error) } }
async function removeTheme(item: ThemeView) {
  try { await props.confirm(`确定删除主题“${item.name}”吗？`); await themeApi.remove(item.id); await load(); props.message('主题已删除') }
  catch (error) { if (error !== 'cancel' && error !== 'close') props.fail(error) }
}
async function restoreOfficial(item: ThemeView | null) {
  if (!item) return
  try {
    await props.confirm(`确定要把「${item.name}」还原为官方默认吗？你在它上面做的修改会被清空，且不能撤销。`)
    const updated = await themeApi.reset(item.id); if (activeThemeKey.value === updated.themeKey) apply(updated); await load()
    if (editor.value && editing.value === item.id) { assignSnapshot({ name: updated.name, description: updated.description || '', baseThemeKey: updated.baseThemeKey, previewImageUrl: updated.previewImageUrl || '', enabled: updated.enabled, definitionJson: completeDefinition(updated.definitionJson) }); editingSource.value = updated; seedHistory() }
    props.message('已还原为官方默认')
  } catch (error) { if (error !== 'cancel' && error !== 'close') props.fail(error) }
}
function applyPreset(item: ThemeView) { form.definitionJson = completeDefinition(item.definitionJson); onFieldTouched(settingGroups.find(group => group.key === 'background') || settingGroups[0]!, { key: 'style', preview: 'home' }); props.message(`已套用「${item.name}」，可以继续微调`) }
function presetSwatch(item: ThemeView) { const colors = item.definitionJson.colors as JsonObject | undefined; return { background: `linear-gradient(90deg,${colors?.background || '#eee'} 0 34%,${colors?.primary || '#666'} 34% 67%,${colors?.accent || '#c76d4b'} 67% 100%)` } }

function addSticker() { if (stickerItems.value.length >= 10) return; stickerItems.value.push({ asset: 'classic-compass', area: 'section-gap' }); if (form.definitionJson.stickers.density === 'none') form.definitionJson.stickers.density = 'low'; touchStickers() }
function removeSticker(index: number) { stickerItems.value.splice(index, 1); touchStickers() }
function touchStickers() { const group = settingGroups.find(item => item.key === 'stickers'); if (group) onFieldTouched(group, { key: 'items', preview: 'journal' }) }
const stickerPreview = (asset: string) => `/assets/themes/stickers/${asset}.svg`
function chooseHero() { heroInput.value?.click() }
async function heroPicked(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = ''; if (!file) return
  heroUploading.value = true
  try { const body = new FormData(); body.append('file', file); const asset = await themeApi.uploadHero(body); form.definitionJson.hero.mediaId = asset.id; const group = settingGroups.find(item => item.key === 'hero'); if (group) onFieldTouched(group, { key: 'mediaId', preview: 'home' }); props.message('封面已上传，保存主题后生效') }
  catch (error) { props.fail(error) }
  finally { heroUploading.value = false }
}
function clearHero() { form.definitionJson.hero.mediaId = null; const group = settingGroups.find(item => item.key === 'hero'); if (group) onFieldTouched(group, { key: 'mediaId', preview: 'home' }) }
function exportTheme(item: ThemeView) {
  const payload = { schemaVersion: 1, name: item.name, description: item.description, baseThemeKey: item.baseThemeKey, previewImageUrl: item.previewImageUrl, definitionJson: item.definitionJson }
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); link.download = `${item.themeKey}.json`; link.click(); URL.revokeObjectURL(link.href)
}
function chooseImport() { importInput.value?.click() }
async function imported(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = ''; if (!file) return
  try {
    const value = JSON.parse(await file.text()) as Partial<Snapshot>
    if (!value.definitionJson) throw new Error('文件中缺少 definitionJson')
    assignSnapshot({ name: `${value.name || '导入的主题'} · 导入`, description: value.description || '', baseThemeKey: value.baseThemeKey || DEFAULT_BASE, previewImageUrl: value.previewImageUrl || '', enabled: true, definitionJson: completeDefinition(value.definitionJson) })
    editing.value = null; editingBuiltin.value = false; editor.value = true; void nextTick(() => { seedHistory(); postPreview() })
  } catch (error) { props.fail(new Error(`导入失败：${error instanceof Error ? error.message : '文件格式错误'}`)) }
}

function viewDiff(item: ThemeView) { diffTarget.value = item; diffDialog.value = true }
function fieldLabel(section: string, key: string) {
  if (section === 'colors') return `色彩 · ${colorFields.find(item => item[0] === key)?.[1] || key}`
  const group = settingGroups.find(item => item.key === section); const field = group?.fields?.find(item => item.key === key)
  return group && field ? `${group.label} · ${field.label}` : `${section}.${key}`
}
function formatValue(value: JsonValue | undefined) { if (value === undefined || value === null) return '（未设置）'; if (Array.isArray(value)) return `${value.length} 项`; return typeof value === 'object' ? JSON.stringify(value) : String(value) }
const diffEntries = computed<DiffEntry[]>(() => {
  const item = diffTarget.value; if (!item?.overrideJson) return []
  return Object.entries(item.overrideJson).flatMap(([section, value]) => {
    const official = item.officialDefinitionJson?.[section]
    if (value && typeof value === 'object' && !Array.isArray(value)) return Object.entries(value).map(([key, newValue]) => ({ label: fieldLabel(section, key), oldValue: official && typeof official === 'object' && !Array.isArray(official) ? official[key] : undefined, newValue }))
    return [{ label: fieldLabel(section, section), oldValue: official, newValue: value }]
  })
})
function luminance(hex: string) { const values = hex.replace('#', '').match(/.{2}/g)?.map(value => parseInt(value, 16) / 255) || [0, 0, 0]; return values.map(value => value <= .03928 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4)).reduce((sum, value, index) => sum + value * ([.2126, .7152, .0722][index] || 0), 0) }
function contrastRatio(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }

watch(form, () => { postPreview(); if (restoring || !editor.value) return; if (historyTimer !== null) clearTimeout(historyTimer); historyTimer = window.setTimeout(pushHistory, 280) }, { deep: true })
watch(previewWrap, element => { previewObserver?.disconnect(); previewObserver = null; if (!element) return; previewObserver = new ResizeObserver(measurePreview); previewObserver.observe(element) })
watch(previewMode, () => void nextTick(measurePreview))
onMounted(load)
onBeforeUnmount(() => { if (historyTimer !== null) clearTimeout(historyTimer); previewObserver?.disconnect() })
</script>

<template>
  <div><div class="page-head"><div><h2>主题外观</h2><p>让网站跟着四季自己变，或者固定选一套；也可以复制后设计自己的色彩、字体、布局与图片风格。</p></div><div class="theme-page-actions"><input ref="importInput" type="file" accept="application/json" hidden @change="imported"><el-button @click="chooseImport">导入 JSON</el-button><el-button type="primary" @click="openEditor(null, true)">新建设计</el-button></div></div>
    <article class="panel theme-season-card" :class="{ selected: isAuto }"><div class="theme-season-main"><div><h3>跟随季节</h3><p>春夏秋冬各有一套完整视觉，按站点所在地的日期自动轮换，不用手动切。</p></div><p class="theme-season-now">当前：<strong>{{ seasonHint || '…' }}</strong></p></div><div class="theme-season-actions"><span v-if="isAuto" class="theme-badge">正在使用</span><el-button v-else type="primary" :loading="changing === '__auto__'" @click="followSeason">跟随季节</el-button></div></article>
    <div class="theme-grid"><article v-for="item in themes" :key="`${item.themeKey}-${item.version}`" class="panel theme-preview" :class="{ selected: isActive(item) }"><div class="theme-card-live"><iframe loading="lazy" src="/theme-card-preview.html" :title="`${item.name}实时预览`" @load="postCardPreview($event, item)" /></div><div class="theme-info"><div><div class="theme-card-title"><h3>{{ item.name }}</h3><small>{{ item.builtin ? (item.customizedCount ? `系统主题 · 已自定义 ${item.customizedCount} 项` : '系统主题 · 官方默认') : '我的主题' }} · v{{ item.version }}</small></div><p>{{ item.description }}</p></div><span v-if="isActive(item)" class="theme-badge">当前主题</span><span v-else-if="isAuto && item.themeKey === siteState?.seasonThemeKey" class="theme-badge theme-badge--season">本季正在使用</span></div>
      <footer class="theme-card-actions"><el-button v-if="!isActive(item)" type="primary" :loading="changing === item.themeKey" @click="selectTheme(item)">使用</el-button><el-button @click="openEditor(item)">设计</el-button><el-button v-if="item.builtin && item.customizedCount" @click="viewDiff(item)">查看修改</el-button><el-button v-if="item.builtin" :disabled="!item.customizedCount" @click="restoreOfficial(item)">还原默认</el-button><el-button v-if="!item.builtin" @click="duplicateTheme(item)">复制</el-button><el-button @click="exportTheme(item)">导出</el-button><el-button v-if="!item.builtin" type="danger" link @click="removeTheme(item)">删除</el-button></footer></article></div>
    <el-dialog v-model="diffDialog" title="已修改的设置" width="min(640px,92vw)"><p v-if="!diffEntries.length" class="group-hint">还没有修改过任何设置——现在用的就是官方默认值。</p><table v-else class="theme-diff-table"><tbody><tr v-for="row in diffEntries" :key="row.label"><td>{{ row.label }}</td><td><code>{{ formatValue(row.oldValue) }}</code> → <code>{{ formatValue(row.newValue) }}</code></td></tr></tbody></table><template #footer><el-button @click="diffDialog = false">关闭</el-button></template></el-dialog>
    <el-dialog v-model="editor" class="theme-designer-dialog" :title="editingBuiltin ? `设计系统主题 · ${form.name}` : (editing ? '设计主题' : '新建主题')" width="min(1240px,97vw)" destroy-on-close>
      <div class="theme-designer"><section class="theme-controls"><div class="theme-history"><el-button size="small" :disabled="!canUndo" @click="undo">撤销</el-button><el-button size="small" :disabled="!canRedo" @click="redo">重做</el-button><el-button size="small" @click="resetEditor">恢复打开时状态</el-button><el-button v-if="editingBuiltin" size="small" @click="restoreOfficial(editingSource)">还原官方默认</el-button></div>
        <p v-if="editingBuiltin" class="group-hint">这是系统主题「{{ form.name }}」，改动会叠加在官方默认值之上单独保存；名称和说明保持官方原样。</p>
        <div class="theme-basic"><label>主题名称<el-input v-model="form.name" maxlength="100" :disabled="editingBuiltin" /></label><label>主题说明<el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" :disabled="editingBuiltin" /></label><label>首页封面图<div class="hero-picker"><div class="hero-preview" :class="{ empty: !heroUrl }" :style="heroUrl ? { backgroundImage: `url(${heroUrl})` } : undefined"><span v-if="!heroUrl">使用默认封面</span></div><div class="hero-actions"><el-button size="small" :loading="heroUploading" @click="chooseHero">{{ heroUrl ? '更换封面' : '上传封面' }}</el-button><el-button v-if="heroUrl" size="small" link type="danger" @click="clearHero">恢复默认</el-button></div><input ref="heroInput" hidden type="file" accept="image/jpeg,image/png,image/webp" @change="heroPicked"><small>显示在前台首页首屏右侧，建议横图；保存主题后生效。</small></div></label></div>
        <div class="preset-row"><span class="preset-row-label">从预设开始</span><div class="preset-chips"><button v-for="item in builtinThemes" :key="item.themeKey" type="button" class="preset-chip" @click="applyPreset(item)"><i :style="presetSwatch(item)" /><span>{{ item.name }}</span></button></div></div>
        <details open><summary>色彩</summary><label class="scheme-toggle">明暗基调<el-radio-group :model-value="form.definitionJson.colors.scheme" size="small" @update:model-value="updateScheme"><el-radio-button value="light">亮色</el-radio-button><el-radio-button value="dark">暗色</el-radio-button></el-radio-group></label><div class="theme-color-grid"><label v-for="item in colorFields" :key="item[0]"><span>{{ item[1] }}</span><el-color-picker :model-value="form.definitionJson.colors[item[0]]" @update:model-value="updateColor(item[0], $event)" /><code>{{ form.definitionJson.colors[item[0]] }}</code></label></div><div class="contrast-note" :class="{ warn: !contrast.ok }">正文与背景对比度 {{ contrast.ratio }}:1 · {{ contrast.ok ? '阅读对比度良好' : '建议达到 4.5:1 以上' }}</div></details>
        <details v-for="group in basicGroups" :key="group.key"><summary>{{ group.label }}</summary><p v-if="group.hint" class="group-hint">{{ group.hint }}</p><div class="theme-setting-grid"><label v-for="field in group.fields" :key="field.key" class="setting-field" :class="{ 'is-disabled': fieldDisabled(field) }"><span class="setting-field-head"><span>{{ field.label }}</span><small class="scene-badge">{{ sceneLabels[fieldScene(group, field)] }}<template v-if="field.target"> · {{ field.target }}</template></small></span><small v-if="field.help" class="field-help">{{ field.help }}</small><small v-else class="field-help field-help-placeholder">占位</small>
          <el-select v-if="field.type === 'select'" :model-value="settingValue(group, field)" :disabled="fieldDisabled(field)" @update:model-value="updateSetting(group, field, $event)" @change="onFieldTouched(group, field)"><el-option v-for="option in field.options" :key="String(option[0])" :label="option[1]" :value="option[0]" /></el-select><el-input-number v-else-if="field.type === 'number'" :model-value="settingValue(group, field)" :min="field.min" :max="field.max" :step="field.step" :disabled="fieldDisabled(field)" controls-position="right" @update:model-value="updateSetting(group, field, $event)" @change="onFieldTouched(group, field)" /><el-switch v-else-if="field.type === 'switch'" :model-value="settingValue(group, field)" :disabled="fieldDisabled(field)" @update:model-value="updateSetting(group, field, $event)" @change="onFieldTouched(group, field)" /><el-color-picker v-else :model-value="settingValue(group, field)" :disabled="fieldDisabled(field)" @update:model-value="updateSetting(group, field, $event)" @change="onFieldTouched(group, field)" /></label></div></details>
        <details class="advanced-toggle"><summary>高级效果</summary><details v-for="group in advancedGroups" :key="group.key" class="advanced-group"><summary>{{ group.label }}</summary><p v-if="group.hint" class="group-hint">{{ group.hint }}</p><div class="theme-setting-grid"><label v-for="field in group.fields" :key="field.key" class="setting-field" :class="{ 'is-disabled': fieldDisabled(field) }"><span class="setting-field-head"><span>{{ field.label }}</span><small class="scene-badge">{{ sceneLabels[fieldScene(group, field)] }}</small></span><small v-if="field.help" class="field-help">{{ field.help }}</small><small v-else class="field-help field-help-placeholder">占位</small>
          <el-select v-if="field.type === 'select'" :model-value="settingValue(group, field)" :disabled="fieldDisabled(field)" @update:model-value="updateSetting(group, field, $event)" @change="onFieldTouched(group, field)"><el-option v-for="option in field.options" :key="String(option[0])" :label="option[1]" :value="option[0]" /></el-select><el-input-number v-else-if="field.type === 'number'" :model-value="settingValue(group, field)" :min="field.min" :max="field.max" :step="field.step" :disabled="fieldDisabled(field)" controls-position="right" @update:model-value="updateSetting(group, field, $event)" @change="onFieldTouched(group, field)" /><el-switch v-else-if="field.type === 'switch'" :model-value="settingValue(group, field)" :disabled="fieldDisabled(field)" @update:model-value="updateSetting(group, field, $event)" @change="onFieldTouched(group, field)" /><el-color-picker v-else :model-value="settingValue(group, field)" :disabled="fieldDisabled(field)" @update:model-value="updateSetting(group, field, $event)" @change="onFieldTouched(group, field)" /></label></div>
          <div v-if="group.key === 'stickers'" class="sticker-editor"><article v-for="(item, index) in stickerItems" :key="index" class="sticker-row"><img :src="stickerPreview(item.asset)" alt=""><el-select v-model="item.asset" filterable @change="touchStickers"><el-option-group v-for="pack in stickerAssets" :key="pack.group" :label="pack.group"><el-option v-for="asset in pack.items" :key="asset[0]" :label="asset[1]" :value="asset[0]" /></el-option-group></el-select><el-select v-model="item.area" @change="touchStickers"><el-option v-for="area in stickerAreas" :key="area[0]" :label="area[1]" :value="area[0]" /></el-select><button type="button" class="danger" @click="removeSticker(index)">×</button></article><p v-if="!stickerItems.length" class="group-hint">还没有贴纸。加两三张就够了，页面留白本身也是内容。</p><el-button plain size="small" :disabled="stickerItems.length >= 10" @click="addSticker">＋ 添加贴纸</el-button></div>
        </details></details>
      </section><section class="theme-live"><header><span class="theme-live-title"><strong>网站实时预览</strong><small>固定示例数据</small></span><div><button type="button" :class="{ active: previewMode === 'desktop' }" @click="previewMode = 'desktop'">桌面</button><button type="button" :class="{ active: previewMode === 'mobile' }" @click="previewMode = 'mobile'">手机</button></div></header><div class="theme-live-scenes"><button type="button" :class="{ active: previewScene === 'home' }" @click="previewScene = 'home'">首页</button><button type="button" :class="{ active: previewScene === 'journal' }" @click="previewScene = 'journal'">日记</button><button type="button" :class="{ active: previewScene === 'map' }" @click="previewScene = 'map'">地图</button></div><div ref="previewWrap" class="theme-frame-wrap" :class="previewMode"><div class="preview-stage" :style="stageStyle"><iframe ref="previewFrame" :style="frameStyle" :src="previewSrc" title="主题实时预览" @load="previewLoaded" /></div></div></section></div>
      <template #footer><el-button @click="editor = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveTheme">保存主题</el-button></template>
    </el-dialog>
  </div>
</template>
