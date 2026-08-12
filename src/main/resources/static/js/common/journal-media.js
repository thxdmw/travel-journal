/*
 * Block 图片组件的运行时增强，公开端和后台实时预览共用。
 * 常规排版使用 CSS；轮播、胶片条和对比组件在渲染后补充交互结构。
 */
(() => {
  'use strict';

  const ENHANCED = 'journalMediaEnhanced';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /** 取出块里的图片，重排后要从内部结构里找。 */
  function imagesOf(block) {
    return Array.from(block.querySelectorAll('img'));
  }

  /** 把块的原始子节点存起来，teardown 时还原，避免重复 enhance 越套越深。 */
  function keepOriginal(block) {
    if (!block[ENHANCED]) block[ENHANCED] = { children: Array.from(block.childNodes) };
    return block[ENHANCED];
  }

  function restore(block) {
    const state = block[ENHANCED];
    if (!state) return;
    if (state.cleanup) state.cleanup();
    block.replaceChildren(...state.children);
    delete block[ENHANCED];
  }

  // ------------------------------------------------------------ 轮播 / 胶片条

  function buildCarousel(block, strip) {
    const state = keepOriginal(block);
    const images = imagesOf(block);
    const caption = block.querySelector('figcaption');
    if (images.length < 2) return;

    const shell = document.createElement('div');
    shell.className = 'journal-carousel' + (strip ? ' journal-carousel--strip' : '');
    const track = document.createElement('div');
    track.className = 'journal-carousel__track';
    track.append(...images);
    shell.append(track);

    /* 轮播保留翻页按钮和圆点；胶片条依靠触控、鼠标拖动和滚轮连续浏览。 */
    let prev = null, next = null;
    if (!strip) {
      prev = navButton('prev', '上一张');
      next = navButton('next', '下一张');
      shell.append(prev, next);
      prev.addEventListener('click', () => step(track, -1));
      next.addEventListener('click', () => step(track, 1));
    }

    let dots = null;
    if (!strip) {
      dots = document.createElement('div');
      dots.className = 'journal-carousel__dots';
      images.forEach((image, index) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', '第 ' + (index + 1) + ' 张');
        dot.addEventListener('click', () => scrollToIndex(track, index));
        dots.append(dot);
      });
      shell.append(dots);
    }
    if (caption) shell.append(caption);

    block.replaceChildren(shell);

    function sync() {
      const index = currentIndex(track);
      if (dots) Array.from(dots.children).forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
      if (prev && next) {
        prev.disabled = track.scrollLeft <= 2;
        next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
      }
    }
    track.addEventListener('scroll', sync, { passive: true });
    // 图片是懒加载的，尺寸落定后箭头的可用状态才准
    window.addEventListener('resize', sync);
    const stopDrag = enableDragScroll(track);
    state.cleanup = () => { window.removeEventListener('resize', sync); stopDrag(); };
    requestAnimationFrame(sync);
  }

  /**
   * 按住鼠标横向拖动轨道。桌面端除了箭头，这是最顺手的浏览方式。
   *
   * 拖过一点距离之后要吃掉紧随其后的 click，否则松手时会顺带把灯箱打开。
   * 触摸设备本来就能滑，交给浏览器原生处理，这里只认鼠标。
   */
  function enableDragScroll(track) {
    let dragging = false, startX = 0, startLeft = 0, moved = 0;
    function down(event) {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      dragging = true; moved = 0;
      track.setPointerCapture?.(event.pointerId);
      startX = event.clientX;
      startLeft = track.scrollLeft;
      track.classList.add('is-dragging');
    }
    function move(event) {
      if (!dragging) return;
      const delta = event.clientX - startX;
      moved = Math.max(moved, Math.abs(delta));
      track.scrollLeft = startLeft - delta * 1.12;
      if (moved > 3) event.preventDefault();
    }
    function up(event) {
      if (!dragging) return;
      dragging = false;
      track.classList.remove('is-dragging');
      track.releasePointerCapture?.(event.pointerId);
    }
    function click(event) {
      if (moved > 5) { event.preventDefault(); event.stopPropagation(); }
      moved = 0;
    }
    track.addEventListener('pointerdown', down);
    track.addEventListener('pointermove', move);
    function wheel(event) {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (track.scrollWidth <= track.clientWidth) return;
      event.preventDefault();
      track.scrollLeft += event.deltaY;
    }
    track.addEventListener('pointerup', up);
    track.addEventListener('pointercancel', up);
    track.addEventListener('pointerleave', up);
    track.addEventListener('wheel', wheel, { passive: false });
    track.addEventListener('click', click, true);
    return () => {
      track.removeEventListener('pointerdown', down);
      track.removeEventListener('pointermove', move);
      track.removeEventListener('pointerup', up);
      track.removeEventListener('pointercancel', up);
      track.removeEventListener('pointerleave', up);
      track.removeEventListener('wheel', wheel);
      track.removeEventListener('click', click, true);
    };
  }

  /** 按可视宽度翻一屏，用于每张宽度不固定的胶片条。 */
  function navButton(direction, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'journal-carousel__nav journal-carousel__nav--' + direction;
    button.setAttribute('aria-label', label);
    button.textContent = direction === 'prev' ? '‹' : '›';
    return button;
  }

  function currentIndex(track) {
    const slides = Array.from(track.children);
    const center = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDistance = Infinity;
    slides.forEach((slide, index) => {
      const distance = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - center);
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    });
    return best;
  }

  function scrollToIndex(track, index) {
    const slide = track.children[index];
    if (!slide) return;
    track.scrollTo({
      left: slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2,
      behavior: reducedMotion.matches ? 'auto' : 'smooth'
    });
  }

  function step(track, delta) {
    scrollToIndex(track, Math.max(0, Math.min(track.children.length - 1, currentIndex(track) + delta)));
  }

  // ------------------------------------------------------------ 前后对比

  function buildCompare(block) {
    const state = keepOriginal(block);
    const images = imagesOf(block);
    const caption = block.querySelector('figcaption');
    // 只有恰好两张才成立；多了少了都退回竖向堆叠，不要猜用户的意思
    if (images.length !== 2) return;

    const shell = document.createElement('div');
    shell.className = 'journal-compare';
    shell.style.setProperty('--compare', '50%');

    const after = document.createElement('div');
    after.className = 'journal-compare__after';
    after.append(images[1]);

    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'journal-compare__handle';
    handle.setAttribute('role', 'slider');
    handle.setAttribute('aria-label', '拖动对比两张照片');
    handle.setAttribute('aria-valuemin', '0');
    handle.setAttribute('aria-valuemax', '100');
    handle.setAttribute('aria-valuenow', '50');

    shell.append(images[0], after, handle);
    block.replaceChildren(shell);
    if (caption) block.append(caption);

    let dragging = false;
    function setFromClientX(clientX) {
      const box = shell.getBoundingClientRect();
      if (!box.width) return;
      setPercent(((clientX - box.left) / box.width) * 100);
    }
    function setPercent(value) {
      const percent = Math.max(0, Math.min(100, value));
      shell.style.setProperty('--compare', percent + '%');
      handle.setAttribute('aria-valuenow', String(Math.round(percent)));
    }
    function onDown(event) {
      dragging = true;
      shell.setPointerCapture?.(event.pointerId);
      setFromClientX(event.clientX);
    }
    function onMove(event) {
      if (!dragging) return;
      event.preventDefault();
      setFromClientX(event.clientX);
    }
    function onUp() { dragging = false; }
    function onKey(event) {
      const current = Number(handle.getAttribute('aria-valuenow')) || 50;
      if (event.key === 'ArrowLeft') { setPercent(current - 4); event.preventDefault(); }
      else if (event.key === 'ArrowRight') { setPercent(current + 4); event.preventDefault(); }
    }

    shell.addEventListener('pointerdown', onDown);
    shell.addEventListener('pointermove', onMove);
    shell.addEventListener('pointerup', onUp);
    shell.addEventListener('pointercancel', onUp);
    handle.addEventListener('keydown', onKey);
    state.cleanup = () => {
      shell.removeEventListener('pointerdown', onDown);
      shell.removeEventListener('pointermove', onMove);
      shell.removeEventListener('pointerup', onUp);
      shell.removeEventListener('pointercancel', onUp);
      handle.removeEventListener('keydown', onKey);
    };
  }

  // ------------------------------------------------------------ 对外接口

  /**
   * 给站内图片补上 srcset，让浏览器按视口和屏幕密度自己挑尺寸。
   *
   * <p>刻意在渲染时加而不是写进 markdown：一来存量日记能立刻受益，
   * 二来正文保持 `<img src>` 这种最朴素的形式，导出的 Markdown 换到别的博客也能用，
   * 后端那条「图片必须是站内地址」的校验也不用跟着放宽。</p>
   *
   * <p>sizes 用 68vw 作为保守估计：正文里的图默认占内容宽度的 68%，
   * 猜小了会糊，猜大了只是多下一点，所以宁可往大了写。</p>
   */
  function applyResponsiveImages(root) {
    if (!root) return;
    root.querySelectorAll('img[src*="/api/media/"]').forEach(image => {
      if (image.dataset.responsive === 'on') return;
      const match = image.getAttribute('src').match(/^(.*\/api\/media\/\d+)\/(display|medium|thumbnail)$/);
      if (!match) return;
      const base = match[1];
      image.srcset = base + '/thumbnail 480w, ' + base + '/medium 768w, ' + base + '/display 1280w';
      image.sizes = '(max-width: 700px) 92vw, (max-width: 1100px) 78vw, 68vw';
      image.dataset.responsive = 'on';
    });
  }

  /** 扫描 root，给需要行为的图片块补上结构和事件。重复调用是安全的。 */
  function enhance(root) {
    if (!root) return;
    applyResponsiveImages(root);
    root.querySelectorAll('.journal-gallery').forEach(block => {
        if (block[ENHANCED]) return;
        const hasExplicitLayout = Array.from(block.classList).some(name => name.startsWith('journal-gallery--'));
        const themeLayout = hasExplicitLayout ? '' : document.documentElement.dataset.galleryLayout;
        if (block.classList.contains('journal-gallery--compare')) buildCompare(block);
        else if (block.classList.contains('journal-gallery--carousel') || themeLayout === 'carousel') buildCarousel(block, false);
        else if (block.classList.contains('journal-gallery--filmstrip') || themeLayout === 'filmstrip') buildCarousel(block, true);
      });
  }

  /** 还原 enhance 的改动，组件卸载或正文重渲染前调用。 */
  function teardown(root) {
    if (!root) return;
    root.querySelectorAll('.journal-gallery--carousel, .journal-gallery--filmstrip, .journal-gallery--compare, .journal-gallery')
      .forEach(restore);
  }

  /**
   * 真正的正文媒体图片选择器：单图、图片组、明信片。主题贴纸、头像、Logo、地图图标
   * 这些非正文图片一律不在此列——灯箱和图片分组只认这三种容器下的 <img>，
   * 不管它们在 DOM 里离得多近。
   */
  const MEDIA_SELECTOR = '.journal-figure img, .journal-gallery img, .journal-postcard img';

  /**
   * 取某张图片所属的一组，供灯箱翻页用。
   * 同一个多图块算一组；正文里零散的单图算作「整篇正文」一组，这样连着写的
   * 几张图也能左右翻，符合读者的预期。
   */
  function groupOf(image) {
    if (!(image instanceof HTMLImageElement)) return [];
    if (!image.matches(MEDIA_SELECTOR)) return [];
    const block = image.closest('.journal-gallery');
    const scope = block || image.closest('.journal-document');
    if (!scope) return [image];
    return Array.from(scope.querySelectorAll(MEDIA_SELECTOR));
  }

  // ------------------------------------------------------------ 正文标记

  /*
   * 版式没有单独的数据表，全部以 class 的形式活在 Markdown 正文里，
   * 所以「怎么拼」和「怎么读回来」必须放在一起，改一个就得改另一个。
   * 后端 JournalTemplateService.figure() 生成的是同一套标记，改这里记得同步。
   *
   * 约定：每个轴的默认值一律不输出 class，沿用主题的 data-image-* 设置。
   * 这样改动之前写的日记一个字都不用动。
   */
  window.JournalMedia = { applyResponsiveImages, enhance, teardown, groupOf, MEDIA_SELECTOR };
})();
