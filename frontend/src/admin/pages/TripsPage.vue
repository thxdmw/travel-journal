<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { themeApi } from '@/api/theme'
import { tripApi } from '@/api/trip'
import { useRouter } from 'vue-router'
import type { ThemeView } from '@/types/theme'
import type { Trip, TripRequest, TripStatus } from '@/types/trip'

export interface TripsPageDeps {
  message(text: string): void
  warning(text: string): void
  fail(error: unknown): void
}

interface FormHandle {
  validate(): Promise<unknown>
  clearValidate(): void
}

const props = defineProps<TripsPageDeps>()
const router = useRouter()
const data = ref<Trip[]>([])
const themes = ref<ThemeView[]>([])
const loading = ref(false)
const dialog = ref(false)
const editing = ref<number | null>(null)
const keyword = ref('')
const formRef = ref<FormHandle | null>(null)
const saving = ref(false)
const coverInput = ref<HTMLInputElement | null>(null)
const coverFile = ref<File | null>(null)
const coverPreview = ref('')
const coverCleared = ref(false)
const allowTextInput = !window.matchMedia?.('(pointer: coarse)').matches
const imageTypes = ['image/jpeg', 'image/png', 'image/webp']
const tripStatusOptions: { value: TripStatus, label: string }[] = [
  { value: 'PLANNING', label: '规划中' },
  { value: 'ONGOING', label: '旅行中' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'ARCHIVED', label: '已归档' },
]

function blankTrip(): TripRequest {
  return { title: '', slug: '', summary: '', status: 'PLANNING', startDate: '', endDate: '', defaultCurrency: 'CNY', coverMediaId: null, internalNote: '', themeKey: null }
}

const form = reactive<TripRequest>(blankTrip())
const required = (message: string, trigger = 'blur') => ({ required: true, message, trigger })
const rules = {
  title: [required('请填写旅行标题')],
  slug: [required('请填写 Slug'), { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: '只能使用小写字母、数字和短横线', trigger: 'blur' }],
  status: [required('请选择旅行状态', 'change')],
  startDate: [required('请选择开始日期', 'change')],
  endDate: [required('请选择结束日期', 'change'), {
    validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => callback(!value || !form.startDate || value >= form.startDate ? undefined : new Error('结束日期不能早于开始日期')),
    trigger: 'change',
  }],
  defaultCurrency: [required('请填写币种'), { pattern: /^[A-Za-z]{3}$/, message: '币种为 3 位字母，例如 CNY', trigger: 'blur' }],
}
const coverUrl = computed(() => coverPreview.value || (form.coverMediaId ? `/api/media/${form.coverMediaId}/thumbnail` : ''))

async function load() {
  loading.value = true
  try {
    const [trips, availableThemes] = await Promise.all([
      tripApi.list({ page: 1, pageSize: 100, keyword: keyword.value }),
      themeApi.list(true),
    ])
    data.value = trips.items
    themes.value = availableThemes
  } catch (error) {
    props.fail(error)
  } finally {
    loading.value = false
  }
}

function releasePreview() {
  if (coverPreview.value) URL.revokeObjectURL(coverPreview.value)
  coverPreview.value = ''
}

function resetCover() {
  releasePreview()
  coverFile.value = null
  coverCleared.value = false
}

function chooseCover() {
  coverInput.value?.click()
}

function coverPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!imageTypes.includes(file.type)) {
    props.warning('封面只支持 JPEG、PNG 和 WebP')
    return
  }
  releasePreview()
  coverFile.value = file
  coverCleared.value = false
  coverPreview.value = URL.createObjectURL(file)
}

function removeCover() {
  releasePreview()
  coverFile.value = null
  coverCleared.value = Boolean(form.coverMediaId)
  form.coverMediaId = null
}

function open(item?: Trip) {
  editing.value = item?.id ?? null
  Object.assign(form, blankTrip(), item || {})
  resetCover()
  dialog.value = true
  void nextTick(() => formRef.value?.clearValidate())
}

async function save() {
  try {
    await formRef.value?.validate()
  } catch {
    props.warning('请先补全标记为必填的内容')
    return
  }
  saving.value = true
  try {
    let tripId = editing.value
    if (tripId && coverCleared.value && !coverFile.value) await tripApi.clearCover(tripId)
    if (tripId) await tripApi.update(tripId, form)
    else tripId = (await tripApi.create(form)).id
    if (coverFile.value) {
      const payload = new FormData()
      payload.append('file', coverFile.value)
      await tripApi.uploadCover(tripId, payload)
    }
    dialog.value = false
    props.message('旅行已保存')
    await load()
  } catch (error) {
    props.fail(error)
  } finally {
    saving.value = false
  }
}

function statusLabel(status: TripStatus): string {
  return tripStatusOptions.find(item => item.value === status)?.label || status
}

onMounted(load)
onBeforeUnmount(releasePreview)
</script>

<template>
  <div><div class="page-head"><div><h2>旅行管理</h2><p>从计划到完成，集中整理每一次出发。</p></div><el-button type="primary" @click="open()">新建旅行</el-button></div>
    <div class="panel"><div class="toolbar"><el-input v-model="keyword" clearable placeholder="搜索旅行" style="max-width: 280px" @keyup.enter="load" /><el-button @click="load">查询</el-button></div>
    <div class="panel-pad"><div v-loading="loading" class="trip-list"><article v-for="item in data" :key="item.id" class="admin-trip-card" @click="router.push('/trips/' + item.id)">
      <img v-if="item.coverMediaId" class="trip-card-cover" :src="`/api/media/${item.coverMediaId}/thumbnail`" :alt="item.title">
      <div v-else class="trip-card-cover trip-card-cover-empty" aria-hidden="true"><span>还没有封面</span></div>
      <span class="status">{{ statusLabel(item.status) }}</span><h3>{{ item.title }}</h3><p>{{ item.summary || '还没有旅行简介' }}</p><footer><span>{{ item.startDate }} — {{ item.endDate }}</span><el-button link @click.stop="open(item)">编辑</el-button></footer>
    </article></div><el-empty v-if="!data.length && !loading" description="还没有旅行" /></div></div>
    <el-dialog v-model="dialog" :title="editing ? '编辑旅行' : '新建旅行'" width="min(680px,92vw)" @closed="resetCover">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="标题" prop="title"><el-input v-model="form.title" placeholder="例如：京都的四月" /></el-form-item>
        <el-form-item label="Slug" prop="slug"><el-input v-model="form.slug" placeholder="japan-2026，前台网址会用到" /></el-form-item>
        <el-form-item label="封面图片"><div class="cover-picker"><div class="cover-preview" :class="{ empty: !coverUrl }" @click="chooseCover"><img v-if="coverUrl" :src="coverUrl" alt="旅行封面"><span v-else>点击选择封面</span></div><div class="cover-actions"><el-button size="small" @click="chooseCover">{{ coverUrl ? '更换封面' : '选择封面' }}</el-button><el-button v-if="coverUrl" size="small" type="danger" link @click="removeCover">移除</el-button><small>JPEG / PNG / WebP，保存旅行时一并上传</small></div><input ref="coverInput" hidden type="file" accept="image/jpeg,image/png,image/webp" @change="coverPicked"></div></el-form-item>
        <el-form-item label="简介"><el-input v-model="form.summary" type="textarea" :rows="3" maxlength="1000" show-word-limit /></el-form-item>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px"><el-form-item label="开始日期" prop="startDate"><el-date-picker v-model="form.startDate" :editable="allowTextInput" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择开始日期" /></el-form-item><el-form-item label="结束日期" prop="endDate"><el-date-picker v-model="form.endDate" :editable="allowTextInput" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="选择结束日期" /></el-form-item></div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px"><el-form-item label="状态" prop="status"><el-select v-model="form.status"><el-option v-for="item in tripStatusOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item><el-form-item label="币种" prop="defaultCurrency"><el-input v-model="form.defaultCurrency" maxlength="3" placeholder="CNY" /></el-form-item></div>
        <el-form-item label="旅行专属主题"><el-select v-model="form.themeKey" clearable placeholder="继承全站主题"><el-option v-for="item in themes" :key="item.themeKey" :label="item.name" :value="item.themeKey" /></el-select></el-form-item>
        <el-form-item label="内部备注"><el-input v-model="form.internalNote" type="textarea" :rows="2" placeholder="只有后台能看到" /></el-form-item>
      </el-form><template #footer><el-button @click="dialog = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>
  </div>
</template>
