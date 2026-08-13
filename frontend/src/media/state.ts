/**
 * 增强状态。
 *
 * 记着块的原始子节点，teardown 时还原——不然重复 enhance 会把上一次生成的
 * 结构再包一层，越套越深。
 *
 * 用 WeakMap 而不是往 DOM 元素上挂属性：状态不进 DOM，元素被移除时自动回收。
 */
export interface EnhancedState {
  children: ChildNode[]
  cleanup?: () => void
}

const states = new WeakMap<Element, EnhancedState>()

export function isEnhanced(block: Element): boolean {
  return states.has(block)
}

export function keepOriginal(block: Element): EnhancedState {
  let state = states.get(block)
  if (!state) {
    state = { children: Array.from(block.childNodes) }
    states.set(block, state)
  }
  return state
}

export function restore(block: Element): void {
  const state = states.get(block)
  if (!state) return
  state.cleanup?.()
  block.replaceChildren(...state.children)
  states.delete(block)
}
