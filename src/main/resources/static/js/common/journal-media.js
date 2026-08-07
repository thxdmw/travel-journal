/*
 * 日记正文里图片块的运行时行为，公开端和后台实时预览共用。
 *
 * 正文是 Markdown + 受控 HTML，经 marked + DOMPurify 之后由 v-html 塞进页面，
 * 所以事件不能写在正文里，只能在渲染完成后扫一遍 DOM 补上。
 *
 * 约定：
 *   - row / grid / masonry / mosaic 纯 CSS，这里不管。
 *   - carousel / filmstrip / compare 需要额外结构，由 enhance() 重排出来。
 *     重排前它们就是普通的竖向堆叠图片，不会坏页面。
 *   - 重排只动运行时 DOM，正文字符串不受影响；teardown() 能原样还原。
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

    /*
     * 箭头两种模式都要有。桌面端鼠标滚轮只滚纵向，横向轨道的滚动条又被
     * scrollbar-width:none 藏掉了，没有箭头就等于完全滚不动——
     * 胶片条以前就漏了这一组按钮，PC 上只能看到第一屏。
     * 圆点只有轮播才给：胶片条是连续浏览，不是一张一页。
     */
    const prev = navButton('prev', strip ? '向左查看' : '上一张');
    const next = navButton('next', strip ? '向右查看' : '下一张');
    shell.append(prev, next);
    // 胶片条每张宽度不一，按可视宽度翻更自然；轮播仍然按整张对齐
    prev.addEventListener('click', () => strip ? nudge(track, -1) : step(track, -1));
    next.addEventListener('click', () => strip ? nudge(track, 1) : step(track, 1));

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
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
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
      startX = event.clientX;
      startLeft = track.scrollLeft;
      track.classList.add('is-dragging');
    }
    function move(event) {
      if (!dragging) return;
      const delta = event.clientX - startX;
      moved = Math.max(moved, Math.abs(delta));
      track.scrollLeft = startLeft - delta;
      if (moved > 3) event.preventDefault();
    }
    function up() {
      if (!dragging) return;
      dragging = false;
      track.classList.remove('is-dragging');
    }
    function click(event) {
      if (moved > 5) { event.preventDefault(); event.stopPropagation(); }
      moved = 0;
    }
    track.addEventListener('pointerdown', down);
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', up);
    track.addEventListener('pointercancel', up);
    track.addEventListener('pointerleave', up);
    track.addEventListener('click', click, true);
    return () => {
      track.removeEventListener('pointerdown', down);
      track.removeEventListener('pointermove', move);
      track.removeEventListener('pointerup', up);
      track.removeEventListener('pointercancel', up);
      track.removeEventListener('pointerleave', up);
      track.removeEventListener('click', click, true);
    };
  }

  /** 按可视宽度翻一屏，用于每张宽度不固定的胶片条。 */
  function nudge(track, direction) {
    track.scrollBy({ left: direction * track.clientWidth * 0.82,
                     behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  }

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

  /** 扫描 root，给需要行为的图片块补上结构和事件。重复调用是安全的。 */
  function enhance(root) {
    if (!root) return;
    root.querySelectorAll('.journal-gallery--carousel, .journal-gallery--filmstrip, .journal-gallery--compare')
      .forEach(block => {
        if (block[ENHANCED]) return;
        if (block.classList.contains('journal-gallery--compare')) buildCompare(block);
        else buildCarousel(block, block.classList.contains('journal-gallery--filmstrip'));
      });
  }

  /** 还原 enhance 的改动，组件卸载或正文重渲染前调用。 */
  function teardown(root) {
    if (!root) return;
    root.querySelectorAll('.journal-gallery--carousel, .journal-gallery--filmstrip, .journal-gallery--compare')
      .forEach(restore);
  }

  /**
   * 取某张图片所属的一组，供灯箱翻页用。
   * 同一个多图块算一组；正文里零散的单图算作「整篇正文」一组，这样连着写的
   * 几张图也能左右翻，符合读者的预期。
   */
  function groupOf(image) {
    if (!(image instanceof HTMLImageElement)) return [];
    const block = image.closest('.journal-gallery');
    const scope = block || image.closest('.markdown-body');
    if (!scope) return [image];
    return Array.from(scope.querySelectorAll('img'));
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
  const GALLERY_MODES = ['row', 'grid', 'masonry', 'mosaic', 'magazine', 'story', 'staggered',
                         'carousel', 'filmstrip', 'compare'];
  /**
   * 保持原始比例的排布方式：这些模式下裁剪比例和焦点没有意义，
   * 后台面板会据此隐藏那两项。和 journal-media.css 里「不设 aspect-ratio」的布局一一对应。
   */
  const FREE_RATIO_MODES = ['masonry', 'filmstrip', 'story', 'staggered'];
  const AXES = [
    { key: 'ratio', prefix: 'journal-figure--ratio-', values: ['16x9', '4x3', '1x1', '3x4'] },
    { key: 'focus', prefix: 'journal-figure--focus-', values: ['top', 'bottom'] },
    { key: 'frame', prefix: 'journal-figure--frame-', values: ['none', 'line', 'paper', 'float', 'polaroid', 'tape', 'film', 'postcard'] },
    { key: 'radius', prefix: 'journal-figure--radius-', values: ['none', 'soft', 'round'] },
    { key: 'tone', prefix: 'journal-figure--tone-', values: ['warm', 'vintage', 'mono'] },
    { key: 'effect', prefix: 'journal-figure--effect-', values: ['lift', 'zoom', 'tilt'] },
    { key: 'captionPos', prefix: 'journal-figure--caption-', values: ['left', 'overlay', 'side', 'none'] }
  ];
  const SIZES = ['small', 'medium', 'large', 'full', 'bleed'];
  const ALIGNS = ['left', 'center', 'right'];

  /** 正文里一整段图片块，用于定位和替换。没有嵌套 figure，所以非贪婪匹配就够。 */
  const FIGURE_BLOCK = /<figure class="journal-(?:figure|gallery)[\s\S]*?<\/figure>/g;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function unescapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  }

  /** 把版式状态拼成写进正文的受控 HTML。预览台和真正插入用的是同一个函数。 */
  function buildFigure(state) {
    const items = (state.items || []).filter(item => item && item.displayUrl);
    if (!items.length) return '';
    const multi = items.length > 1 && GALLERY_MODES.includes(state.mode);
    const classes = [];
    if (multi) {
      classes.push('journal-gallery', 'journal-gallery--' + state.mode);
      if (['grid', 'masonry'].includes(state.mode)) classes.push('journal-gallery--cols-' + (state.cols || 3));
    } else {
      classes.push('journal-figure');
    }
    if (SIZES.includes(state.size)) classes.push('journal-figure--' + state.size);
    if (ALIGNS.includes(state.align)) classes.push('journal-figure--' + state.align);
    // 环绕只在居左/居右且不是通栏时成立
    if (state.wrap && ['left', 'right'].includes(state.align) && !['full', 'bleed'].includes(state.size)) {
      classes.push('journal-figure--wrap');
    }
    AXES.forEach(axis => {
      if (axis.values.includes(state[axis.key])) classes.push(axis.prefix + state[axis.key]);
    });

    const caption = String(state.caption || '').trim();
    const body = items.map(item => {
      const alt = escapeHtml(item.alt || caption || '旅行照片');
      return '  <img src="' + item.displayUrl + '" alt="' + alt + '" loading="lazy">';
    }).join('\n');
    return '<figure class="' + classes.join(' ') + '">\n' + body + '\n'
      + (caption ? '  <figcaption>' + escapeHtml(caption) + '</figcaption>\n' : '')
      + '</figure>';
  }

  /**
   * 把正文里的一段图片块读回版式状态，供「点预览里的图重新编辑」用。
   * 只认本编辑器自己生成的格式；认不出来就返回 null，由调用方提示用户手改，
   * 绝不猜着改，免得把手工编辑过的正文写坏。
   */
  function parseFigure(markup) {
    const classMatch = /^<figure class="([^"]*)"/.exec(markup);
    if (!classMatch) return null;
    const classes = classMatch[1].split(/\s+/).filter(Boolean);
    const urls = [];
    const alts = [];
    const imgPattern = /<img\s+src="([^"]+)"\s+alt="([^"]*)"[^>]*>/g;
    let match;
    while ((match = imgPattern.exec(markup))) { urls.push(match[1]); alts.push(unescapeHtml(match[2])); }
    if (!urls.length) return null;

    const captionMatch = /<figcaption>([\s\S]*?)<\/figcaption>/.exec(markup);
    const mode = GALLERY_MODES.find(name => classes.includes('journal-gallery--' + name));
    const state = {
      mode: mode || 'single',
      items: urls.map((url, index) => ({ displayUrl: url, alt: alts[index] })),
      size: SIZES.find(name => classes.includes('journal-figure--' + name)) || 'medium',
      align: ALIGNS.find(name => classes.includes('journal-figure--' + name)) || 'center',
      wrap: classes.includes('journal-figure--wrap'),
      cols: Number((classes.find(name => name.startsWith('journal-gallery--cols-')) || '').replace('journal-gallery--cols-', '')) || 3,
      caption: captionMatch ? unescapeHtml(captionMatch[1]).trim() : ''
    };
    AXES.forEach(axis => {
      state[axis.key] = axis.values.find(value => classes.includes(axis.prefix + value)) || '';
    });
    return state;
  }

  /** 按出现顺序列出正文里全部图片块的 [start,end) 区间，索引与预览里的块一一对应。 */
  function figureRanges(markdown) {
    const ranges = [];
    const pattern = new RegExp(FIGURE_BLOCK.source, 'g');
    let match;
    while ((match = pattern.exec(markdown))) {
      ranges.push({ start: match.index, end: match.index + match[0].length, markup: match[0] });
    }
    return ranges;
  }

  window.JournalMedia = {
    enhance, teardown, groupOf,
    buildFigure, parseFigure, figureRanges,
    GALLERY_MODES, FREE_RATIO_MODES, SIZES, ALIGNS
  };
})();
