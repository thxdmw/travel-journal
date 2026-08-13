<script setup lang="ts">
import type { MediaView } from '@/types/media'

export interface TemplateInput {
  weather?: string
  mood?: string
  value?: string | number
  comment?: string
  mediaIds?: number | number[] | null
  [key: string]: unknown
}

interface TemplateBlock {
  id?: unknown
  type?: unknown
  title?: unknown
  required?: unknown
  config?: { max?: unknown, placeholder?: unknown } | unknown
}

const props = defineProps<{ block: TemplateBlock, modelValue: TemplateInput, media: MediaView[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: TemplateInput] }>()
const type = String(props.block.type || '')
const title = String(props.block.title || '')
const config = props.block.config && typeof props.block.config === 'object' ? props.block.config as { max?: unknown, placeholder?: unknown } : {}
const update = (key: string, value: unknown) => emit('update:modelValue', { ...props.modelValue, [key]: value })
</script>

<template>
  <template v-if="type === 'trip-info'"><label>{{ title }}</label><div class="form-grid form-grid-2"><el-input :model-value="modelValue.weather" placeholder="天气" @update:model-value="update('weather', $event)" /><el-input :model-value="modelValue.mood" placeholder="心情" @update:model-value="update('mood', $event)" /></div></template>
  <template v-else-if="['text', 'textarea', 'quote'].includes(type)"><label>{{ title }} <em v-if="block.required">必填</em></label><el-input :model-value="modelValue.value" :type="type === 'text' ? 'text' : 'textarea'" :rows="4" :placeholder="String(config.placeholder || '填写内容')" @update:model-value="update('value', $event)" /></template>
  <template v-else-if="type === 'rating'"><label>{{ title }}</label><el-rate :model-value="modelValue.value" :max="Number(config.max || 5)" @update:model-value="update('value', $event)" /></template>
  <template v-else-if="type === 'image'"><label>{{ title }}</label><el-select :model-value="modelValue.mediaIds" clearable @update:model-value="update('mediaIds', $event)"><el-option v-for="item in media" :key="item.id" :label="item.caption || item.filename" :value="item.id" /></el-select></template>
  <template v-else-if="type === 'gallery'"><label>{{ title }}</label><el-select :model-value="modelValue.mediaIds" multiple @update:model-value="update('mediaIds', $event)"><el-option v-for="item in media" :key="item.id" :label="item.caption || item.filename" :value="item.id" /></el-select></template>
  <div v-else class="template-auto-block"><strong>{{ title }}</strong><span>从当前旅行自动整理</span></div>
</template>
