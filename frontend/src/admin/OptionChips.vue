<script setup lang="ts">
/*
 * 平铺的单选按钮组，用来替掉设置面板里的下拉框。
 *
 * 图片设置有十来个选项，全是下拉。手机上每点开一个就盖住半屏，选完还要再点一次才知道
 * 变成了什么样——而这些选项本来就只有三到十个，摊开来一眼能看完，点一下即生效。
 * 顺带解决另一件事：Element Plus 的 el-select 在手机上会聚焦一个真实的 input，
 * 于是选个「圆角」也会弹出软键盘。按钮不聚焦输入框，就没有这回事。
 *
 * 放不下就换行，不做横向滚动——横滑的那一排永远有一半选项藏在屏幕外。
 */

/** [值, 标签]，和 el-option 的 value/label 一一对应。 */
export type ChipOption = readonly [string | number, string]

defineProps<{
  modelValue: string | number | null | undefined
  options: readonly ChipOption[]
  /** 无障碍名称，同时也是这组选项的用途说明。 */
  label?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [string | number] }>()
</script>

<template>
  <div class="option-chips" role="radiogroup" :aria-label="label">
    <button
      v-for="[value, text] in options"
      :key="String(value)"
      type="button"
      role="radio"
      class="option-chip"
      :class="{ 'is-active': modelValue === value }"
      :aria-checked="modelValue === value"
      @click="emit('update:modelValue', value)">
      {{ text }}
    </button>
  </div>
</template>
