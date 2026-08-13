/*
 * 本地 vendor/vue 的 ESM 桥。HTML 先加载浏览器全局版，Vite 中的 `vue`
 * 导入统一指向本文件，既保持依赖本地托管，也避免重复打包运行时。
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
  Teleport,
  computed,
  createApp,
  createBlock,
  createCommentVNode,
  createElementBlock,
  createElementVNode,
  createStaticVNode,
  createTextVNode,
  createVNode,
  defineComponent,
  h,
  markRaw,
  normalizeClass,
  normalizeStyle,
  nextTick,
  onBeforeUnmount,
  onMounted,
  openBlock,
  reactive,
  ref,
  renderList,
  resolveComponent,
  resolveDirective,
  resolveDynamicComponent,
  toDisplayString,
  unref,
  vModelCheckbox,
  vModelSelect,
  vModelText,
  watch,
  withCtx,
  withDirectives,
  withKeys,
  withModifiers,
} = window.Vue
