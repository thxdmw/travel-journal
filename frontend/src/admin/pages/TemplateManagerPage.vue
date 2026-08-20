<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { templateApi, type JournalTemplate } from '@/api/template'
import { CATALOG, TEMPLATE_MODE_HINTS, canonicalTemplateType, templateBlockMode } from '@/journal/catalog'
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
/** 第一次加载还没回来。之后的刷新保留旧卡片只加遮罩，不再整页闪骨架屏。 */
const firstLoad = ref(true)
const dialog = ref(false)
const editing = ref<number | null>(null)
const previewDialog = ref(false)
const previewing = ref<JournalTemplate | null>(null)
const previewEl = ref<HTMLElement | null>(null)
const builderPreviewEl = ref<HTMLElement | null>(null)
const activeCategory = ref('全部')

/*
 * 窄屏不并排放预览。
 *
 * 和日记编辑器用同一个断点、同一套 matchMedia：手机上左右分栏之后，预览那半栏根本容不下
 * 正文宽度，看到的排版和发布后不是一回事，不如换成一个按钮开整屏预览。
 */
const compactQuery = window.matchMedia?.('(max-width:780px)') ?? null
const compactLayout = ref(compactQuery?.matches ?? false)
const onCompactChange = (event: MediaQueryListEvent) => { compactLayout.value = event.matches }

/**
 * 区块库直接就是「添加区块」那份目录。
 *
 * 模板以前自带一份 12 种的清单，名字还和编辑器对不上（单行文字 / 长文字 vs 正文，
 * 照片墙 vs 图片组）。现在两处同源，作者在模板里看到的和在日记里看到的是同一批组件。
 */
const categories = ['全部', ...new Set(CATALOG.map(entry => entry.category))]
const libraryItems = computed(() => CATALOG.filter(
  entry => activeCategory.value === '全部' || entry.category === activeCategory.value))

const form = reactive({ name: '', description: '', category: 'CUSTOM', enabled: true, definitionJson: { title: '', blocks: [] as TemplateBlock[] } })

function blocksOf(template: JournalTemplate | null): TemplateBlock[] {
  const blocks = template?.definitionJson.blocks
  if (!Array.isArray(blocks)) return []
  const copy = JSON.parse(JSON.stringify(blocks)) as TemplateBlock[]
  // 导入或尚未迁移的老模板可能带着已下线的 text / textarea，读进来就搬成正文里的真实类型
  return copy.map(block => ({ ...block, type: canonicalTemplateType(block.type) }))
}

function blockMeta(type: string) {
  return CATALOG.find(entry => entry.type === type)
}

function blockLabel(type: string) {
  return blockMeta(type)?.label || type
}

/** 这一块的内容从哪来：旅行数据、套用时填，还是生成后到编辑器里填。 */
function modeOf(type: string) {
  return TEMPLATE_MODE_HINTS[templateBlockMode(type)]
}

function blockTip(type: string) {
  const meta = blockMeta(type)
  return `${meta?.description || ''}\n${modeOf(type).hint}`
}

async function load() {
  loading.value = true
  try { items.value = await templateApi.list(false) }
  catch (error) { props.fail(error) }
  finally { loading.value = false; firstLoad.value = false }
}

function reset() {
  editing.value = null
  activeCategory.value = '全部'
  Object.assign(form, { name: '', description: '', category: 'CUSTOM', enabled: true, definitionJson: { title: '', blocks: [] } })
}

function create() {
  reset()
  dialog.value = true
}

function edit(item: JournalTemplate) {
  reset()
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

/** 窄屏时用同一个全屏预览看正在搭的这份模板。 */
function previewDraft() {
  previewing.value = { name: form.name || '我的模板', definitionJson: { blocks: form.definitionJson.blocks } } as unknown as JournalTemplate
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
  if (['paragraph', 'heading', 'quote'].includes(type)) config.placeholder = '写下这一段'
  if (['image', 'gallery', 'postcard'].includes(type)) { config.imageSize = 'medium'; config.align = 'center' }
  if (type === 'gallery') config.layout = 'grid'
  if (type === 'rating') config.max = 5
  if (type === 'route') config.source = 'itinerary'
  if (type === 'expense-summary') config.source = 'expense'
  // 标题和分隔线本身就是排版元素，再挂一个区块标题会在正文里连着出现两行
  const title = ['heading', 'divider'].includes(type) ? '' : blockLabel(type)
  form.definitionJson.blocks.push({ id: `block_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`, type, title, required: false, config })
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
  if (copy.title) copy.title += ' 副本'
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

onMounted(() => { compactQuery?.addEventListener('change', onCompactChange); void load() })
onBeforeUnmount(() => {
  compactQuery?.removeEventListener('change', onCompactChange)
  teardown(previewEl.value)
  teardown(builderPreviewEl.value)
})
</script>

<template>
  <div><div class="page-head"><div><h2>日记模板</h2><p>把常写的结构保存下来，下次只填当时的天气、心情和故事。</p></div><el-button type="primary" @click="create">新建我的模板</el-button></div>
    <!-- 首次加载给骨架卡片，之后的刷新给遮罩：和日记管理、旅行管理同一套分工 -->
    <div v-if="firstLoad" class="template-card-grid">
      <article v-for="index in 6" :key="index" class="panel template-card"><el-skeleton :rows="3" animated /></article>
    </div>
    <div v-else v-loading="loading" class="template-card-grid"><article v-for="item in items" :key="item.id" class="panel template-card"><header><span>{{ item.builtin ? '系统模板' : '我的模板' }}</span><small>第 {{ item.version }} 版</small></header><h3>{{ item.name }}</h3><p>{{ item.description || '还没有模板说明' }}</p><div class="template-block-tags"><i v-for="block in blocksOf(item).slice(0, 6)" :key="block.id">{{ block.title || blockLabel(block.type) }}</i></div><footer><el-button link @click="preview(item)">预览</el-button><el-button link @click="duplicate(item)">复制</el-button><template v-if="!item.builtin"><el-button link type="primary" @click="edit(item)">编辑</el-button><el-button link type="danger" @click="remove(item)">删除</el-button></template></footer></article></div>

    <!--
      模板预览整屏，手机和电脑都是。

      走的是 article-preview-dialog —— 和日记编辑器的「预览全文」同一套：整屏、正文按
      --tj-article-width 排，两端都已经有适配好的样式。弹窗版的问题在于正文被压到 860px 的
      对话框里再减掉内边距，图片每一档宽度都是相对正文宽度算的，看到的大小就不是发布后的大小。
    -->
    <!-- eslint-disable vue/no-v-html -- 内容由项目内 JournalBlocks 安全渲染器生成。 -->
    <el-dialog v-model="previewDialog" :title="`${previewing?.name || '模板'} · 预览`" class="article-preview-dialog template-preview-dialog" append-to-body destroy-on-close>
      <p class="article-preview-note">下面是用示例旅行数据渲染的效果，实际生成时会换成这篇日记所属旅行的真实内容。</p>
      <article ref="previewEl" class="preview journal-document article-preview-body" v-html="previewHtml"></article>
      <template #footer><el-button @click="previewDialog = false">关闭</el-button><el-button v-if="previewing?.id" type="primary" @click="previewDialog = false; duplicate(previewing)">复制为我的模板</el-button></template>
    </el-dialog>

    <!--
      模板编辑铺满整屏，左边预览右边配置。

      和图片区块的配置弹窗是同一个道理：预览那一栏必须容得下真实的正文宽度（760px），
      被压窄之后同一份模板在这里和发布之后就是两个排版，预览也就失去意义。整屏之后左边
      给足正文宽度，右边的配置栏也终于有完整的高度可滚。
    -->
    <el-dialog v-model="dialog" :title="editing ? '编辑我的模板' : '新建我的模板'" class="template-editor-dialog template-editor-dialog--full" append-to-body :close-on-click-modal="false">
      <div class="template-workbench" :class="{ 'has-preview': !compactLayout }">
        <!-- 宽屏并排的是整篇示例文章，和读者看到的是同一套渲染 -->
        <aside v-if="!compactLayout" class="template-live-preview">
          <div class="template-live-head">文章预览<small>示例数据 · 改配置会实时跟着变</small></div>
          <div class="template-preview-paper"><article ref="builderPreviewEl" class="preview journal-document article-preview-body" v-html="builderPreview"></article></div>
          <div v-if="!form.definitionJson.blocks.length" class="template-live-empty">添加区块后这里会显示生成的日记长什么样</div>
        </aside>
        <div class="template-config">
          <!-- 窄屏没有并排预览，换成一个整行按钮开整屏预览，免得作者以为压根没有预览 -->
          <button v-if="compactLayout" type="button" class="block-effect-entry" :disabled="!form.definitionJson.blocks.length" @click="previewDraft">👁 预览这份模板</button>
          <el-form label-position="top"><div class="form-grid form-grid-2"><el-form-item label="模板名称"><el-input v-model="form.name" maxlength="120" placeholder="例如：海边慢游的一天" /></el-form-item><el-form-item label="是否启用"><el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" /></el-form-item></div><el-form-item label="模板说明"><el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" show-word-limit /></el-form-item></el-form>
          <!-- 区块库就是「添加区块」那份目录，分类和名字都一致 -->
          <section class="block-library-panel">
            <header><span>添加区块</span><small>和写日记时能加的组件完全一样，共 {{ CATALOG.length }} 种</small></header>
            <div class="block-categories"><button v-for="item in categories" :key="item" type="button" :class="{ active: activeCategory === item }" @click="activeCategory = item">{{ item }}</button></div>
            <div class="block-library">
              <el-tooltip v-for="entry in libraryItems" :key="entry.type" :content="blockTip(entry.type)" placement="top" :show-after="200" popper-class="block-tip">
                <button type="button" :class="`mode-${templateBlockMode(entry.type)}`" @click="addBlock(entry.type)">＋ {{ entry.label }}<i aria-hidden="true">{{ modeOf(entry.type).badge }}</i></button>
              </el-tooltip>
            </div>
          </section>
          <div class="template-builder">
            <el-empty v-if="!form.definitionJson.blocks.length" description="从上方添加第一个区块" />
            <article v-for="(block, index) in form.definitionJson.blocks" :key="block.id" class="template-block-editor">
              <div class="block-order"><button type="button" :disabled="index === 0" @click="move(index, -1)">↑</button><strong>{{ index + 1 }}</strong><button type="button" :disabled="index === form.definitionJson.blocks.length - 1" @click="move(index, 1)">↓</button></div>
              <div class="block-fields">
                <!-- 标题和分隔线在正文里没有区块标题，这一行就不给了 -->
                <div class="block-title-row"><el-input v-if="!['heading', 'divider'].includes(block.type)" v-model="block.title" placeholder="区块标题，显示为正文里的小标题"><template #prepend>{{ blockLabel(block.type) }}</template></el-input><strong v-else class="block-type-name">{{ blockLabel(block.type) }}</strong><el-switch v-if="templateBlockMode(block.type) === 'prompt'" v-model="block.required" active-text="必填" inactive-text="选填" /><em v-else class="block-mode-tag">{{ modeOf(block.type).badge }}</em></div>
                <p class="block-desc">{{ blockMeta(block.type)?.description }}｜{{ modeOf(block.type).hint }}</p>
                <el-input v-if="['paragraph', 'heading', 'quote'].includes(block.type)" v-model="block.config.placeholder" placeholder="填写提示语" />
                <el-select v-if="block.type === 'route'" v-model="block.config.source"><el-option label="路线来源：当天行程条目" value="itinerary" /><el-option label="路线来源：整趟旅行的城市顺序" value="trip" /></el-select>
                <el-select v-if="block.type === 'expense-summary'" v-model="block.config.source"><el-option label="统计范围：日记当天的支出" value="expense" /><el-option label="统计范围：整趟旅行的全部支出" value="trip" /></el-select>
                <el-input-number v-if="block.type === 'rating'" v-model="block.config.max" :min="3" :max="10" controls-position="right" style="width: 140px" />
                <div v-if="['image', 'gallery', 'postcard'].includes(block.type)" class="form-grid form-grid-2"><el-select v-model="block.config.imageSize"><el-option label="小图" value="small" /><el-option label="中图" value="medium" /><el-option label="大图" value="large" /><el-option label="满宽" value="full" /></el-select><el-select v-model="block.config.align"><el-option label="居左" value="left" /><el-option label="居中" value="center" /><el-option label="居右" value="right" /></el-select></div>
                <el-select v-if="block.type === 'gallery'" v-model="block.config.layout" placeholder="图组排布"><el-option label="网格" value="grid" /><el-option label="并排" value="row" /><el-option label="拼贴" value="mosaic" /><el-option label="轮播" value="carousel" /><el-option label="胶片条" value="filmstrip" /><el-option label="前后对比" value="compare" /></el-select>
              </div>
              <div class="block-actions"><button type="button" @click="copyBlock(index)">复制</button><button type="button" class="danger" @click="form.definitionJson.blocks.splice(index, 1)">删除</button></div>
            </article>
          </div>
        </div>
        <!-- 按钮钉在配置栏底部，而不是横跨整个弹窗：左边那一大片是预览，底下没有要操作的东西 -->
        <div class="template-editor-actions"><span></span><el-button @click="dialog = false">取消</el-button><el-button type="primary" @click="save">保存模板</el-button></div>
      </div>
    </el-dialog>
    <!-- eslint-enable vue/no-v-html -->
  </div>
</template>
