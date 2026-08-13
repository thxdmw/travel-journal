/*
 * SFC 迁移期的 Vue ESM 桥。HTML 会先加载本地 vendor/vue 全局版，
 * Vite 将生产构建中的 `vue` 导入指向本文件，使 SFC 和旧 IIFE 共用同一实例。
 */
import type * as VueRuntime from 'vue'

declare global {
  interface Window {
    Vue: typeof VueRuntime
  }
}

if (!window.Vue) throw new Error('页面缺少 vendor/vue，无法初始化 Vue 应用')

export const {
  Fragment,
  computed,
  createBlock,
  createCommentVNode,
  createElementBlock,
  createElementVNode,
  createTextVNode,
  defineComponent,
  normalizeClass,
  onMounted,
  openBlock,
  ref,
  renderList,
  resolveComponent,
  toDisplayString,
  vModelText,
  watch,
  withCtx,
  withDirectives,
  withKeys,
} = window.Vue
