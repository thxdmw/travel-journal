export function installCustomCursor(): void {
  const STORAGE_KEY = 'travel-journal.custom-cursor';
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  const adminMode = Boolean(document.getElementById('admin-app'));
  let enabled = readPreference();
  let active = false;
  let cursor: HTMLDivElement;
  let toggle: HTMLButtonElement;
  let label: HTMLElement;
  let pointerX = 0;
  let pointerY = 0;
  let lastX = 0;
  let lastY = 0;
  let hasPosition = false;
  let animationFrame = 0;
  let settleTimer = 0;
  let lastTrailAt = 0;
  let pendingTarget: EventTarget | null = null;

  function readPreference() {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
      return true;
    }
  }

  function savePreference() {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch { /* 隐私模式可能禁用存储 */ }
  }

  function buildUi() {
    cursor = document.createElement('div');
    cursor.className = 'travel-cursor';
    cursor.dataset.state = 'compass';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.innerHTML = `
      <span class="travel-cursor__shape">
        <i class="travel-cursor__icon travel-cursor__compass"></i>
        <i class="travel-cursor__icon travel-cursor__camera"></i>
        <i class="travel-cursor__icon travel-cursor__pen"></i>
        <i class="travel-cursor__icon travel-cursor__grab"></i>
      </span>`;

    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'travel-cursor-toggle';
    toggle.innerHTML = '<span class="travel-cursor-toggle__icon" aria-hidden="true">✥</span><span class="travel-cursor-toggle__label"></span>';
    const labelElement = toggle.querySelector<HTMLElement>('.travel-cursor-toggle__label');
    if (!labelElement) throw new Error('自定义光标开关缺少标签')
    label = labelElement;
    toggle.addEventListener('click', () => {
      enabled = !enabled;
      savePreference();
      syncState();
    });

    document.body.append(cursor, toggle);
  }

  function syncState() {
    active = finePointer.matches && enabled;
    root.classList.toggle('travel-cursor-enabled', active);
    toggle.setAttribute('aria-pressed', String(active));
    toggle.setAttribute('aria-label', active ? '关闭旅行主题鼠标' : '启用旅行主题鼠标');
    toggle.title = active ? '关闭旅行主题鼠标' : '启用旅行主题鼠标';
    label.textContent = active ? '关闭旅行光标' : '启用旅行光标';
    if (!active) {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      clearTimeout(settleTimer);
      cursor.classList.remove('is-visible', 'is-clicking');
      removeEffects();
    }
  }

  function stateFor(target: EventTarget | null) {
    if (!(target instanceof Element)) return 'compass';
    if (target.closest('.leaflet-container, .map-box')) return 'map';
    if (target.closest('input, textarea, [contenteditable="true"]')) return 'writing';
    if (target.closest('img, picture, .card-photo, .hero-photo, .trip-banner-photo, .journal-gallery, .journal-carousel, .journal-compare')) return 'photo';
    if (target.closest('a, button, select, [role="button"], [role="link"], [role="tab"], [tabindex]:not([tabindex="-1"]), .el-select, .el-switch, .el-checkbox, .el-radio, .el-tabs__item, .el-date-editor, .el-input-number__decrease, .el-input-number__increase, .admin-trip-card, .workspace-head .back, .upload-box')) return 'link';
    if (target.closest('.journal-document, .preview, .article, article')) return 'writing';
    return 'compass';
  }

  function applyTargetState() {
    const state = stateFor(pendingTarget);
    cursor.dataset.state = state;
    cursor.classList.remove('is-suppressed');
  }

  function onPointerMove(event: PointerEvent) {
    if (!active || event.pointerType === 'touch') return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    pendingTarget = event.target;
    if (!animationFrame) animationFrame = requestAnimationFrame(renderPointer);
  }

  function renderPointer(timestamp: number) {
    animationFrame = 0;
    const dx = hasPosition ? pointerX - lastX : 0;
    const dy = hasPosition ? pointerY - lastY : 0;
    const distance = Math.hypot(dx, dy);
    const tilt = Math.max(-14, Math.min(14, dx * .72));
    cursor.style.transform = `translate3d(${pointerX - 15}px, ${pointerY}px, 0)`;
    cursor.style.setProperty('--travel-cursor-tilt', `${tilt}deg`);
    cursor.classList.add('is-visible');
    applyTargetState();

    clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => cursor.style.setProperty('--travel-cursor-tilt', '0deg'), 90);
    if (hasPosition && !adminMode && !reducedMotion.matches && distance > 12 && timestamp - lastTrailAt > 58 && !cursor.classList.contains('is-suppressed')) {
      addTrail(pointerX - dx * .45, pointerY - dy * .45);
      lastTrailAt = timestamp;
    }
    lastX = pointerX;
    lastY = pointerY;
    hasPosition = true;
  }

  function addTrail(x: number, y: number) {
    const dot = document.createElement('i');
    dot.className = 'travel-cursor-trail';
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    document.body.append(dot);
    window.setTimeout(() => dot.remove(), 460);
  }

  function addRipple(event: PointerEvent) {
    if (reducedMotion.matches || cursor.classList.contains('is-suppressed') || cursor.dataset.state === 'map') return;
    const ripple = document.createElement('i');
    ripple.className = 'travel-cursor-ripple';
    ripple.style.left = `${event.clientX}px`;
    ripple.style.top = `${event.clientY}px`;
    document.body.append(ripple);
    window.setTimeout(() => ripple.remove(), 620);
  }

  function removeEffects() {
    document.querySelectorAll('.travel-cursor-trail, .travel-cursor-ripple').forEach(element => element.remove());
  }

  function onPointerDown(event: PointerEvent) {
    if (!active || event.pointerType === 'touch') return;
    pendingTarget = event.target;
    applyTargetState();
    cursor.classList.add('is-clicking');
    addRipple(event);
  }

  function onPointerUp() {
    cursor.classList.remove('is-clicking');
  }

  function onPointerLeave(event: PointerEvent) {
    if (!event.relatedTarget) cursor.classList.remove('is-visible');
  }

  function mount() {
    buildUi();
    syncState();
    document.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.addEventListener('pointerup', onPointerUp, { passive: true });
    document.addEventListener('pointercancel', onPointerUp, { passive: true });
    document.addEventListener('pointerout', onPointerLeave, { passive: true });
    window.addEventListener('blur', () => cursor.classList.remove('is-visible'));
    finePointer.addEventListener('change', syncState);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
}
