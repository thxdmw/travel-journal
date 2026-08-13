import { keepOriginal } from './state'

/*
 * 轮播与胶片条。
 *
 * 轮播保留翻页按钮和圆点；胶片条依靠触控、鼠标拖动和滚轮连续浏览。
 */

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

function imagesOf(block: Element): HTMLImageElement[] {
  return Array.from(block.querySelectorAll('img'))
}

function navButton(direction: 'prev' | 'next', label: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'journal-carousel__nav journal-carousel__nav--' + direction
  button.setAttribute('aria-label', label)
  button.textContent = direction === 'prev' ? '‹' : '›'
  return button
}

/** 离轨道中线最近的那张就是当前张。每张宽度不固定，不能按索引乘宽度算。 */
export function currentIndex(track: HTMLElement): number {
  const slides = Array.from(track.children) as HTMLElement[]
  const center = track.scrollLeft + track.clientWidth / 2
  let best = 0
  let bestDistance = Infinity
  slides.forEach((slide, index) => {
    const distance = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - center)
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  })
  return best
}

function scrollToIndex(track: HTMLElement, index: number): void {
  const slide = track.children[index] as HTMLElement | undefined
  if (!slide) return
  track.scrollTo({
    left: slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2,
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  })
}

function step(track: HTMLElement, delta: number): void {
  const target = Math.max(0, Math.min(track.children.length - 1, currentIndex(track) + delta))
  scrollToIndex(track, target)
}

/**
 * 按住鼠标横向拖动轨道。桌面端除了箭头，这是最顺手的浏览方式。
 *
 * 拖过一点距离之后要吃掉紧随其后的 click，否则松手时会顺带把灯箱打开。
 * 触摸设备本来就能滑，交给浏览器原生处理，这里只认鼠标。
 */
export function enableDragScroll(track: HTMLElement): () => void {
  let dragging = false
  let startX = 0
  let startLeft = 0
  let moved = 0

  function down(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    dragging = true
    moved = 0
    track.setPointerCapture?.(event.pointerId)
    startX = event.clientX
    startLeft = track.scrollLeft
    track.classList.add('is-dragging')
  }

  function move(event: PointerEvent): void {
    if (!dragging) return
    const delta = event.clientX - startX
    moved = Math.max(moved, Math.abs(delta))
    // 1.12 的系数让拖动跟手一点，1:1 在宽轨道上会觉得拖不动
    track.scrollLeft = startLeft - delta * 1.12
    if (moved > 3) event.preventDefault()
  }

  function up(event: PointerEvent): void {
    if (!dragging) return
    dragging = false
    track.classList.remove('is-dragging')
    track.releasePointerCapture?.(event.pointerId)
  }

  function click(event: MouseEvent): void {
    // 拖过 5px 以上就当作拖动而不是点击，别顺手把灯箱开出来
    if (moved > 5) {
      event.preventDefault()
      event.stopPropagation()
    }
    moved = 0
  }

  function wheel(event: WheelEvent): void {
    // 只接管纵向滚轮，横向滚动交给浏览器；轨道没溢出时也不拦
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
    if (track.scrollWidth <= track.clientWidth) return
    event.preventDefault()
    track.scrollLeft += event.deltaY
  }

  track.addEventListener('pointerdown', down)
  track.addEventListener('pointermove', move)
  track.addEventListener('pointerup', up)
  track.addEventListener('pointercancel', up)
  track.addEventListener('pointerleave', up)
  track.addEventListener('wheel', wheel, { passive: false })
  track.addEventListener('click', click, true)

  return () => {
    track.removeEventListener('pointerdown', down)
    track.removeEventListener('pointermove', move)
    track.removeEventListener('pointerup', up)
    track.removeEventListener('pointercancel', up)
    track.removeEventListener('pointerleave', up)
    track.removeEventListener('wheel', wheel)
    track.removeEventListener('click', click, true)
  }
}

export function buildCarousel(block: Element, strip: boolean): void {
  const state = keepOriginal(block)
  const images = imagesOf(block)
  const caption = block.querySelector('figcaption')
  // 只有一张就没有轮播的必要，保持原样
  if (images.length < 2) return

  const shell = document.createElement('div')
  shell.className = 'journal-carousel' + (strip ? ' journal-carousel--strip' : '')
  const track = document.createElement('div')
  track.className = 'journal-carousel__track'
  track.append(...images)
  shell.append(track)

  let prev: HTMLButtonElement | null = null
  let next: HTMLButtonElement | null = null
  let dots: HTMLElement | null = null

  if (!strip) {
    prev = navButton('prev', '上一张')
    next = navButton('next', '下一张')
    shell.append(prev, next)
    prev.addEventListener('click', () => step(track, -1))
    next.addEventListener('click', () => step(track, 1))

    dots = document.createElement('div')
    dots.className = 'journal-carousel__dots'
    images.forEach((_image, index) => {
      const dot = document.createElement('button')
      dot.type = 'button'
      dot.setAttribute('aria-label', '第 ' + (index + 1) + ' 张')
      dot.addEventListener('click', () => scrollToIndex(track, index))
      dots?.append(dot)
    })
    shell.append(dots)
  }
  if (caption) shell.append(caption)

  block.replaceChildren(shell)

  function sync(): void {
    const index = currentIndex(track)
    if (dots) {
      Array.from(dots.children).forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)))
    }
    if (prev && next) {
      // 留 2px 容差，浏览器的 scrollLeft 在边界上会有小数
      prev.disabled = track.scrollLeft <= 2
      next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2
    }
  }

  track.addEventListener('scroll', sync, { passive: true })
  // 图片是懒加载的，尺寸落定后箭头的可用状态才准
  window.addEventListener('resize', sync)
  const stopDrag = enableDragScroll(track)
  state.cleanup = () => {
    window.removeEventListener('resize', sync)
    stopDrag()
  }
  requestAnimationFrame(sync)
}
