<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { journalTagApi } from '@/api/journal'
import type { TagView } from '@/types/journal'

export interface TagManagerPageDeps {
  message(text: string): void
  warning(text: string): void
  fail(error: unknown): void
  confirm(text: string): Promise<unknown>
}

const props = defineProps<TagManagerPageDeps>()
const items = ref<TagView[]>([])
const loading = ref(false)
const renaming = ref<number | null>(null)
const newName = ref('')
const mergeSource = ref<number | null>(null)
const mergeTarget = ref<number | null>(null)

async function load() {
  loading.value = true
  try {
    items.value = await journalTagApi.list()
  } catch (error) {
    props.fail(error)
  } finally {
    loading.value = false
  }
}

function startRename(item: TagView) {
  renaming.value = item.id
  newName.value = item.name
}

async function commitRename() {
  const name = newName.value.trim()
  if (!name || renaming.value == null) return
  try {
    await journalTagApi.rename(renaming.value, name)
    renaming.value = null
    props.message('标签已更新')
    await load()
  } catch (error) {
    props.fail(error)
  }
}

function cancelled(error: unknown): boolean {
  return error === 'cancel' || error === 'close'
}

async function doMerge() {
  if (mergeSource.value == null || mergeTarget.value == null) {
    props.warning('请选择要合并的两个标签')
    return
  }
  if (mergeSource.value === mergeTarget.value) {
    props.warning('不能合并到自己')
    return
  }
  const source = items.value.find(item => item.id === mergeSource.value)
  const target = items.value.find(item => item.id === mergeTarget.value)
  if (!source || !target) return
  try {
    await props.confirm(`把「${source.name}」并入「${target.name}」？前者会被删除，它的日记全部转到后者。`)
    await journalTagApi.merge(source.id, target.id)
    mergeSource.value = null
    mergeTarget.value = null
    props.message('已合并')
    await load()
  } catch (error) {
    if (!cancelled(error)) props.fail(error)
  }
}

async function remove(item: TagView) {
  const prompt = item.journalCount > 0
    ? `「${item.name}」还被 ${item.journalCount} 篇日记使用，删除后这些日记会失去该标签。确定删除？`
    : `确定删除标签「${item.name}」吗？`
  try {
    await props.confirm(prompt)
    await journalTagApi.remove(item.id)
    props.message('标签已删除')
    await load()
  } catch (error) {
    if (!cancelled(error)) props.fail(error)
  }
}

async function purge() {
  try {
    await props.confirm('清理所有没有日记引用的标签？')
    const count = await journalTagApi.purgeUnused()
    props.message(count ? `已清理 ${count} 个空标签` : '没有需要清理的标签')
    await load()
  } catch (error) {
    if (!cancelled(error)) props.fail(error)
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="page-head"><div><h2>标签管理</h2><p>标签在写日记时自动创建，这里可以改名、合并同义标签或清理不再使用的。</p></div><el-button @click="purge">清理无引用标签</el-button></div>
    <div class="panel panel-pad tag-merge-bar">
      <span>合并标签</span>
      <el-select v-model="mergeSource" clearable placeholder="把这个标签" filterable><el-option v-for="item in items" :key="item.id" :label="`${item.name}（${item.journalCount}）`" :value="item.id" /></el-select>
      <span>并入</span>
      <el-select v-model="mergeTarget" clearable placeholder="这个标签" filterable><el-option v-for="item in items" :key="item.id" :label="`${item.name}（${item.journalCount}）`" :value="item.id" /></el-select>
      <el-button type="primary" @click="doMerge">合并</el-button>
    </div>
    <!--
      标签列表用卡片，不用表格。

      表格四列在手机上塞不下，改名和删除都得先横向拖过去；标签本身内容很短，
      竖着排开反而更好扫读。首次加载给骨架屏，之后的刷新用遮罩保留旧内容。
    -->
    <div v-if="loading && !items.length" class="tag-list">
      <article v-for="index in 4" :key="index" class="tag-card"><el-skeleton :rows="1" animated /></article>
    </div>
    <div v-else v-loading="loading" class="tag-list">
      <article v-for="row in items" :key="row.id" class="tag-card">
        <header>
          <template v-if="renaming === row.id">
            <el-input v-model="newName" size="small" class="tag-rename-input" @keyup.enter="commitRename" />
            <span class="tag-rename-actions"><el-button link type="primary" size="small" @click="commitRename">保存</el-button><el-button link size="small" @click="renaming = null">取消</el-button></span>
          </template>
          <template v-else>
            <strong>{{ row.name }}</strong>
            <span class="tag-count">{{ row.journalCount }} 篇</span>
          </template>
        </header>
        <p class="tag-slug">{{ row.slug }}</p>
        <footer><el-button v-if="renaming !== row.id" size="small" @click="startRename(row)">改名</el-button><el-button size="small" type="danger" plain @click="remove(row)">删除</el-button></footer>
      </article>
      <el-empty v-if="!items.length" description="还没有标签，写日记时输入标签名即可创建" />
    </div>
  </div>
</template>
