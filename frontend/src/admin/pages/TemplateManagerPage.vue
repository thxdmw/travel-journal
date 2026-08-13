<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { templateApi, type JournalTemplate } from '@/api/template'
import { render } from '@/journal/render'
import { sampleDocument } from '@/journal/sample'
import { enhance, teardown } from '@/media/enhance'

export interface TemplateManagerPageDeps {
  message(text: string): void
  warning(text: string): void
  fail(error: unknown): void
  confirm(text: string): Promise<unknown>
}

interface TemplateBlock {
  id: string
  type: string
  title: string
  required: boolean
  config: { placeholder?: string, source?: string, max?: number, imageSize?: string, align?: string, layout?: string }
}

const props = defineProps<TemplateManagerPageDeps>()
const items = ref<JournalTemplate[]>([])
const loading = ref(false)
const dialog = ref(false)
const editing = ref<number | null>(null)
const previewDialog = ref(false)
const previewing = ref<JournalTemplate | null>(null)
const previewEl = ref<HTMLElement | null>(null)
const builderPreviewEl = ref<HTMLElement | null>(null)
const blockTypes = [
  { value: 'trip-info', label: '旅行信息', auto: true, desc: '自动带出：日记日期、所选城市、旅行标题，再加上你填的天气和心情，渲染成一行引用。' },
  { value: 'text', label: '单行文字', desc: '一个单行输入框，写标题式的短句。填写提示语可以在这里预设。' },
  { value: 'textarea', label: '长文字', desc: '多行输入框，正文主体一般用这个。填写提示语可以在这里预设。' },
  { value: 'quote', label: '引用', desc: '你填的内容会渲染成引用块，适合放当天最想记住的一句话。' },
  { value: 'rating', label: '评分', desc: '星级评分，生成为 ★★★★☆（4/5）这样的文字。可设置满分。' },
  { value: 'checklist', label: '清单', desc: '待办、行李或打卡清单。' },
  { value: 'route', label: '路线', auto: true, desc: '自动带出路线。「当天行程」按日记日期取当天行程条目的标题；「旅行城市」取整趟旅行的城市顺序。对应来源没有记录时，这一块不会生成。' },
  { value: 'itinerary', label: '行程', auto: true, desc: '自动带出日记当天的行程条目，按时间排成列表（时间 + 标题 + 地址）。当天没有行程记录时，这一块不会生成。' },
  { value: 'expense-summary', label: '花费汇总', auto: true, desc: '自动带出支出并按预算分类合计。「当天」只统计日记日期当天的支出，「整趟旅行」统计这次旅行的全部支出。对应范围内没有支出记录时，这一块不会生成。' },
  { value: 'image', label: '单图', desc: '填写日记时从已上传图片里选一张插入，可设尺寸和对齐。' },
  { value: 'gallery', label: '照片墙', desc: '填写日记时选多张图片，按设定的排布方式生成图组。' },
  { value: 'divider', label: '分隔线', desc: '一条水平分隔线，用来断开段落。' },
]
const form = reactive({ name: '', description: '', category: 'CUSTOM', enabled: true, definitionJson: { title: '', blocks: [] as TemplateBlock[] } })

function blocksOf(template: JournalTemplate | null): TemplateBlock[] {
  const blocks = template?.definitionJson.blocks
  if (!Array.isArray(blocks)) return []
  return JSON.parse(JSON.stringify(blocks)) as TemplateBlock[]
}

function blockMeta(type: string) {
  return blockTypes.find(item => item.value === type)
}

function blockLabel(type: string) {
  return blockMeta(type)?.label || type
}

async function load() {
  loading.value = true
  try { items.value = await templateApi.list(false) }
  catch (error) { props.fail(error) }
  finally { loading.value = false }
}

function reset() {
  editing.value = null
  Object.assign(form, { name: '', description: '', category: 'CUSTOM', enabled: true, definitionJson: { title: '', blocks: [] } })
}

function create() {
  reset()
  dialog.value = true
}

function edit(item: JournalTemplate) {
  editing.value = item.id
  Object.assign(form, { name: item.name, description: item.description || '', category: item.category || 'CUSTOM', enabled: item.enabled, definitionJson: { title: item.name, blocks: blocksOf(item) } })
  dialog.value = true
}

function sampleHtml(blocks: TemplateBlock[]) {
  return render(sampleDocument(blocks), [])
}

const builderPreview = computed(() => sampleHtml(form.definitionJson.blocks))
const previewHtml = computed(() => sampleHtml(blocksOf(previewing.value)))

function preview(item: JournalTemplate) {
  previewing.value = item
  previewDialog.value = true
}

async function refreshMedia(root: HTMLElement | null) {
  await nextTick()
  teardown(root)
  enhance(root)
}

watch(builderPreview, () => { void refreshMedia(builderPreviewEl.value) })
watch(previewHtml, () => { void refreshMedia(previewEl.value) })

function addBlock(type: string) {
  const config: TemplateBlock['config'] = {}
  if (['text', 'textarea', 'quote'].includes(type)) config.placeholder = '写下这一段'
  if (['image', 'gallery'].includes(type)) { config.imageSize = 'medium'; config.align = 'center' }
  if (type === 'gallery') config.layout = 'grid'
  if (type === 'rating') config.max = 5
  if (type === 'route') config.source = 'itinerary'
  if (type === 'expense-summary') config.source = 'expense'
  form.definitionJson.blocks.push({ id: `block_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`, type, title: blockLabel(type), required: false, config })
}

function move(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= form.definitionJson.blocks.length) return
  const [block] = form.definitionJson.blocks.splice(index, 1)
  if (block) form.definitionJson.blocks.splice(target, 0, block)
}

function copyBlock(index: number) {
  const source = form.definitionJson.blocks[index]
  if (!source) return
  const copy = structuredClone(source)
  copy.id = `block_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`
  copy.title += ' 副本'
  form.definitionJson.blocks.splice(index + 1, 0, copy)
}

async function save() {
  if (!form.definitionJson.blocks.length) { props.warning('请至少添加一个区块'); return }
  try {
    const body = { name: form.name, description: form.description, category: form.category, enabled: form.enabled, definitionJson: { title: form.name, blocks: form.definitionJson.blocks } }
    if (editing.value) await templateApi.update(editing.value, body)
    else await templateApi.create(body)
    dialog.value = false
    props.message('模板已保存')
    await load()
  } catch (error) { props.fail(error) }
}

async function duplicate(item: JournalTemplate) {
  try { const copy = await templateApi.duplicate(item.id); props.message(`已复制为“${copy.name}”`); await load() }
  catch (error) { props.fail(error) }
}

async function remove(item: JournalTemplate) {
  try { await props.confirm(`确定删除模板“${item.name}”吗？`); await templateApi.remove(item.id); props.message('模板已删除'); await load() }
  catch (error) { if (error !== 'cancel' && error !== 'close') props.fail(error) }
}

onMounted(load)
onBeforeUnmount(() => { teardown(previewEl.value); teardown(builderPreviewEl.value) })
</script>

<template>
  <div><div class="page-head"><div><h2>日记模板</h2><p>把常写的结构保存下来，下次只填当时的天气、心情和故事。</p></div><el-button type="primary" @click="create">新建我的模板</el-button></div>
    <div v-loading="loading" class="template-card-grid"><article v-for="item in items" :key="item.id" class="panel template-card"><header><span>{{ item.builtin ? '系统模板' : '我的模板' }}</span><small>第 {{ item.version }} 版</small></header><h3>{{ item.name }}</h3><p>{{ item.description || '还没有模板说明' }}</p><div class="template-block-tags"><i v-for="block in blocksOf(item).slice(0, 6)" :key="block.id">{{ block.title || blockLabel(block.type) }}</i></div><footer><el-button link @click="preview(item)">预览</el-button><el-button link @click="duplicate(item)">复制</el-button><template v-if="!item.builtin"><el-button link type="primary" @click="edit(item)">编辑</el-button><el-button link type="danger" @click="remove(item)">删除</el-button></template></footer></article></div>
    <!-- eslint-disable vue/no-v-html -- 内容由项目内 JournalBlocks 安全渲染器生成。 -->
    <el-dialog v-model="previewDialog" :title="`${previewing?.name || '模板'} · 预览`" width="min(860px,96vw)" class="template-preview-dialog"><p class="template-preview-note">下面是用示例旅行数据渲染的效果，实际生成时会换成这篇日记所属旅行的真实内容。</p><article ref="previewEl" class="preview journal-document template-preview-body" v-html="previewHtml"></article><template #footer><el-button @click="previewDialog = false">关闭</el-button><el-button v-if="previewing" type="primary" @click="previewDialog = false; duplicate(previewing)">复制为我的模板</el-button></template></el-dialog>
    <el-dialog v-model="dialog" :title="editing ? '编辑我的模板' : '新建我的模板'" width="min(1320px,96vw)" class="template-editor-dialog"><el-form label-position="top"><div class="form-grid form-grid-2"><el-form-item label="模板名称"><el-input v-model="form.name" maxlength="120" placeholder="例如：海边慢游的一天" /></el-form-item><el-form-item label="是否启用"><el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" /></el-form-item></div><el-form-item label="模板说明"><el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" show-word-limit /></el-form-item></el-form>
      <div class="block-library"><span>添加区块</span><el-tooltip v-for="type in blockTypes" :key="type.value" :content="type.desc" placement="top" :show-after="200" popper-class="block-tip"><button type="button" :class="{ auto: type.auto }" @click="addBlock(type.value)">＋ {{ type.label }}<i v-if="type.auto" aria-hidden="true">自动</i></button></el-tooltip></div>
      <div class="template-workbench"><div class="template-builder"><el-empty v-if="!form.definitionJson.blocks.length" description="从上方添加第一个区块" /><article v-for="(block, index) in form.definitionJson.blocks" :key="block.id" class="template-block-editor"><div class="block-order"><button type="button" :disabled="index === 0" @click="move(index, -1)">↑</button><strong>{{ index + 1 }}</strong><button type="button" :disabled="index === form.definitionJson.blocks.length - 1" @click="move(index, 1)">↓</button></div><div class="block-fields"><div class="block-title-row"><el-input v-model="block.title" placeholder="区块标题，显示为正文里的小标题"><template #prepend>{{ blockLabel(block.type) }}</template></el-input><el-switch v-model="block.required" active-text="必填" inactive-text="选填" /></div><p class="block-desc">{{ blockMeta(block.type)?.desc }}</p>
        <el-input v-if="['text', 'textarea', 'quote'].includes(block.type)" v-model="block.config.placeholder" placeholder="填写提示语" /><el-select v-if="block.type === 'route'" v-model="block.config.source"><el-option label="路线来源：当天行程条目" value="itinerary" /><el-option label="路线来源：整趟旅行的城市顺序" value="trip" /></el-select><el-select v-if="block.type === 'expense-summary'" v-model="block.config.source"><el-option label="统计范围：日记当天的支出" value="expense" /><el-option label="统计范围：整趟旅行的全部支出" value="trip" /></el-select><el-input-number v-if="block.type === 'rating'" v-model="block.config.max" :min="3" :max="10" controls-position="right" style="width: 140px" /><div v-if="['image', 'gallery'].includes(block.type)" class="form-grid form-grid-2"><el-select v-model="block.config.imageSize"><el-option label="小图" value="small" /><el-option label="中图" value="medium" /><el-option label="大图" value="large" /><el-option label="满宽" value="full" /><el-option label="通栏出血" value="bleed" /></el-select><el-select v-model="block.config.align"><el-option label="居左" value="left" /><el-option label="居中" value="center" /><el-option label="居右" value="right" /></el-select></div><el-select v-if="block.type === 'gallery'" v-model="block.config.layout" placeholder="图组排布"><el-option label="竖向逐张排列" value="stack" /><el-option label="并排" value="row" /><el-option label="网格" value="grid" /><el-option label="瀑布流" value="masonry" /><el-option label="拼贴" value="mosaic" /><el-option label="杂志" value="magazine" /><el-option label="故事流" value="story" /><el-option label="错落画廊" value="staggered" /><el-option label="轮播" value="carousel" /><el-option label="胶片条" value="filmstrip" /><el-option label="前后对比" value="compare" /></el-select></div><div class="block-actions"><button type="button" @click="copyBlock(index)">复制</button><button type="button" class="danger" @click="form.definitionJson.blocks.splice(index, 1)">删除</button></div></article></div>
        <aside class="template-live-preview"><div class="template-live-head">实时预览<small>示例数据</small></div><article ref="builderPreviewEl" class="preview journal-document template-preview-body" v-html="builderPreview"></article><div v-if="!form.definitionJson.blocks.length" class="template-live-empty">添加区块后这里会显示生成的日记长什么样</div></aside></div>
      <!-- eslint-enable vue/no-v-html -->
      <template #footer><el-button @click="dialog = false">取消</el-button><el-button type="primary" @click="save">保存模板</el-button></template></el-dialog>
  </div>
</template>
