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
    <div class="panel" style="margin-top: 18px">
      <el-table v-loading="loading" :data="items" max-height="calc(100vh - 340px)">
        <el-table-column label="标签" min-width="220"><template #default="{ row }">
          <template v-if="renaming === row.id"><el-input v-model="newName" size="small" style="max-width: 220px" @keyup.enter="commitRename" /><el-button link type="primary" size="small" @click="commitRename">保存</el-button><el-button link size="small" @click="renaming = null">取消</el-button></template>
          <span v-else>{{ row.name }}</span>
        </template></el-table-column>
        <el-table-column prop="slug" label="标识" min-width="180" />
        <el-table-column prop="journalCount" label="日记数" width="100" />
        <el-table-column label="操作" width="160"><template #default="{ row }"><div class="table-actions"><el-button v-if="renaming !== row.id" size="small" @click="startRename(row)">改名</el-button><el-button size="small" type="danger" plain @click="remove(row)">删除</el-button></div></template></el-table-column>
      </el-table>
    </div>
    <el-empty v-if="!items.length && !loading" description="还没有标签，写日记时输入标签名即可创建" />
  </div>
</template>
