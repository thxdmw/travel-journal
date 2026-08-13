import { keepOriginal } from './state'

/** 前后对比：一条可拖动的分界线，左边是前，右边是后。 */
export function buildCompare(block: Element): void {
  const state = keepOriginal(block)
  const images = Array.from(block.querySelectorAll('img'))
  const caption = block.querySelector('figcaption')
  // 只有恰好两张才成立；多了少了都退回竖向堆叠，不要猜用户的意思
  if (images.length !== 2) return

  const before = images[0]
  const afterImage = images[1]
  if (!before || !afterImage) return

  const shell = document.createElement('div')
  shell.className = 'journal-compare'
  shell.style.setProperty('--compare', '50%')

  const after = document.createElement('div')
  after.className = 'journal-compare__after'
  after.append(afterImage)

  const handle = document.createElement('button')
  handle.type = 'button'
  handle.className = 'journal-compare__handle'
  handle.setAttribute('role', 'slider')
  handle.setAttribute('aria-label', '拖动对比两张照片')
  handle.setAttribute('aria-valuemin', '0')
  handle.setAttribute('aria-valuemax', '100')
  handle.setAttribute('aria-valuenow', '50')

  shell.append(before, after, handle)
  block.replaceChildren(shell)
  // 图注留在 shell 外面，不然会被裁切遮罩盖住一半
  if (caption) block.append(caption)

  let dragging = false

  function setPercent(value: number): void {
    const percent = Math.max(0, Math.min(100, value))
    shell.style.setProperty('--compare', percent + '%')
    handle.setAttribute('aria-valuenow', String(Math.round(percent)))
  }

  function setFromClientX(clientX: number): void {
    const box = shell.getBoundingClientRect()
    // 还没布局出来时宽度是 0，除下去会得到 Infinity
    if (!box.width) return
    setPercent(((clientX - box.left) / box.width) * 100)
  }

  function onDown(event: PointerEvent): void {
    dragging = true
    shell.setPointerCapture?.(event.pointerId)
    setFromClientX(event.clientX)
  }

  function onMove(event: PointerEvent): void {
    if (!dragging) return
    event.preventDefault()
    setFromClientX(event.clientX)
  }

  function onUp(): void {
    dragging = false
  }

  /** 键盘也要能调，这是个 slider。 */
  function onKey(event: KeyboardEvent): void {
    const current = Number(handle.getAttribute('aria-valuenow')) || 50
    if (event.key === 'ArrowLeft') {
      setPercent(current - 4)
      event.preventDefault()
    } else if (event.key === 'ArrowRight') {
      setPercent(current + 4)
      event.preventDefault()
    }
  }

  shell.addEventListener('pointerdown', onDown)
  shell.addEventListener('pointermove', onMove)
  shell.addEventListener('pointerup', onUp)
  shell.addEventListener('pointercancel', onUp)
  handle.addEventListener('keydown', onKey)

  state.cleanup = () => {
    shell.removeEventListener('pointerdown', onDown)
    shell.removeEventListener('pointermove', onMove)
    shell.removeEventListener('pointerup', onUp)
    shell.removeEventListener('pointercancel', onUp)
    handle.removeEventListener('keydown', onKey)
  }
}
