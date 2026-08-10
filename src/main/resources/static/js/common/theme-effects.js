/**
 * 主题特效运行时：粒子层和滚动揭示。
 *
 * 纯 CSS 做不了的那部分特效放在这里，读的还是 theme.js 铺在 <html> 上的
 * data-effects-* / data-motion-* 属性，所以主题一切换就自动跟着变。
 *
 * 三条自我约束：
 *  1. 默认全关，只有主题显式开启才跑；
 *  2. 尊重系统的「减少动态效果」，也尊重页面隐藏（切到后台标签就停）；
 *  3. 粒子数量按视口面积算并封顶，别让弱机器掉帧。
 */
(function () {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // 每种粒子的形态参数：数量系数、大小、下落速度、横向漂移、旋转、颜色
  const PARTICLE_KINDS = {
    snow:   { density: 0.000055, size: [2, 5],   fall: [18, 46],  drift: 26, spin: 0,   color: 'rgba(255,255,255,.86)' },
    sakura: { density: 0.000034, size: [6, 11],  fall: [22, 50],  drift: 44, spin: 1.6, color: 'rgba(255,183,197,.82)' },
    leaves: { density: 0.000026, size: [7, 13],  fall: [26, 58],  drift: 52, spin: 2.1, color: 'rgba(196,140,66,.78)' },
    stars:  { density: 0.000075, size: [1, 2.4], fall: [0, 0],    drift: 0,  spin: 0,   color: 'rgba(255,255,255,.9)' },
    dust:   { density: 0.00006,  size: [1, 3],   fall: [6, 20],   drift: 34, spin: 0,   color: 'rgba(255,240,214,.5)' }
  };

  let canvas = null, ctx = null, particles = [], rafId = 0, lastTime = 0, currentKind = 'none';

  function layer() {
    let element = document.querySelector('.tj-effect-layer');
    if (!element) {
      element = document.createElement('div');
      element.className = 'tj-effect-layer';
      element.setAttribute('aria-hidden', 'true');
      document.body.appendChild(element);
    }
    return element;
  }

  function random(min, max) { return min + Math.random() * (max - min); }

  function spawn(kind, width, height, seeded) {
    const spec = PARTICLE_KINDS[kind];
    return {
      x: Math.random() * width,
      // 首次铺满时随机散布，之后新生的粒子从顶部进入
      y: seeded ? Math.random() * height : -random(10, 80),
      size: random(spec.size[0], spec.size[1]),
      speed: random(spec.fall[0], spec.fall[1]),
      drift: random(-spec.drift, spec.drift),
      angle: Math.random() * Math.PI * 2,
      spin: random(-spec.spin, spec.spin),
      alpha: random(0.45, 1)
    };
  }

  function resize() {
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function targetCount(kind) {
    const area = window.innerWidth * window.innerHeight;
    // 封顶 220，弱机器上也不至于掉帧
    return Math.min(220, Math.round(area * PARTICLE_KINDS[kind].density));
  }

  function draw(now) {
    if (!ctx || currentKind === 'none') return;
    const spec = PARTICLE_KINDS[currentKind];
    const delta = Math.min((now - lastTime) / 1000, 0.05);   // 切标签回来时不要一次跳一大步
    lastTime = now;
    const width = window.innerWidth, height = window.innerHeight;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = spec.color;

    particles.forEach(p => {
      if (spec.fall[1] > 0) {
        p.y += p.speed * delta;
        p.x += Math.sin(p.angle) * p.drift * delta;
        p.angle += p.spin * delta;
        if (p.y - p.size > height) Object.assign(p, spawn(currentKind, width, height, false));
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
      } else {
        // 星星不下落，只做呼吸式明暗
        p.alpha += Math.sin(now / 900 + p.angle) * 0.008;
        p.alpha = Math.max(0.15, Math.min(1, p.alpha));
      }
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(draw);
  }

  function stop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    particles = [];
    if (canvas) { canvas.remove(); canvas = null; ctx = null; }
  }

  function start(kind) {
    stop();
    currentKind = kind;
    if (kind === 'none' || !PARTICLE_KINDS[kind] || reducedMotion.matches) return;
    canvas = document.createElement('canvas');
    canvas.className = 'tj-particle-canvas';
    ctx = canvas.getContext('2d');
    layer().appendChild(canvas);
    resize();
    particles = Array.from({ length: targetCount(kind) },
      () => spawn(kind, window.innerWidth, window.innerHeight, true));
    lastTime = performance.now();
    rafId = requestAnimationFrame(draw);
  }

  function syncParticles() {
    const kind = document.documentElement.dataset.effectsParticles || 'none';
    if (kind === currentKind && (kind === 'none' || rafId)) return;
    start(kind);
  }

  // ---------------------------------------------------------------- 滚动揭示
  let observer = null;

  function syncScrollReveal() {
    const on = document.documentElement.dataset.motionScrollReveal === 'on' && !reducedMotion.matches;
    if (observer) { observer.disconnect(); observer = null; }
    // 关掉时要把已加的类清干净，否则元素会停在透明状态再也不出现
    document.querySelectorAll('.tj-reveal').forEach(el => el.classList.remove('tj-reveal', 'tj-revealed'));
    if (!on) return;
    const targets = document.querySelectorAll('.card-grid > *, .section, .journal-figure, .journal-gallery');
    if (!targets.length) return;
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('tj-revealed');
        observer.unobserve(entry.target);           // 只揭示一次，不做来回切换
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    targets.forEach(el => { el.classList.add('tj-reveal'); observer.observe(el); });
  }

  // ------------------------------------------------------------------ 贴纸
  /*
   * 主题贴纸。
   *
   * 位置来自一份很短的白名单（hero-left、section-gap 之类），主题只表达
   * 「放在页眉右边」这种意图，真正贴在哪由 CSS 决定——绝对坐标在手机上一定会错位。
   * 素材名只允许小写字母、数字和短横线（后端也校验一遍），拼出来的路径固定指向
   * /assets/themes/stickers/ 下的 SVG，主题配置里不会出现任意 URL。
   */
  const STICKER_AREAS = ['hero-left', 'hero-right', 'page-left', 'page-right',
    'section-gap', 'image-corner', 'footer'];
  const SAFE_ASSET = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  function syncStickers() {
    document.querySelectorAll('.tj-sticker').forEach(el => el.remove());
    const definition = window.TravelTheme?.current()?.definitionJson || {};
    const config = definition.stickers || {};
    if (config.density === 'none' || !config.density) return;
    if (!Array.isArray(config.items) || !config.items.length) return;
    const host = layer();
    config.items.forEach(item => {
      const asset = String(item?.asset || '');
      const area = String(item?.area || '');
      if (!SAFE_ASSET.test(asset) || !STICKER_AREAS.includes(area)) return;
      const element = document.createElement('img');
      element.className = 'tj-sticker tj-sticker--' + area;
      element.src = '/assets/themes/stickers/' + asset + '.svg';
      element.alt = '';
      element.setAttribute('aria-hidden', 'true');
      // 贴纸互动也走白名单：主题只能说「点一下弹一下」，不能带任何脚本
      const click = document.documentElement.dataset.interactionsStickerClick;
      if (click && click !== 'none') {
        element.dataset.interaction = click;
        element.addEventListener('click', () => {
          element.classList.remove('is-playing');
          void element.offsetWidth;               // 重启动画，连点两下也有反馈
          element.classList.add('is-playing');
        });
      }
      host.appendChild(element);
    });
  }

  function sync() {
    syncParticles();
    syncScrollReveal();
    syncStickers();
  }

  // <html> 上的 data-* 一变就重新同步，主题切换不需要刷新页面
  new MutationObserver(sync).observe(document.documentElement,
    { attributes: true, attributeFilter: ['data-effects-particles', 'data-motion-scroll-reveal',
      'data-stickers-density', 'data-interactions-sticker-click'] });
  // 贴纸列表不是 data-* 属性（它是个数组），所以额外听一次主题应用完成
  window.addEventListener('travel-theme-applied', syncStickers);

  window.addEventListener('resize', () => { resize(); if (currentKind !== 'none') start(currentKind); });
  // 切到后台标签就停，别在看不见的地方空转耗电
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(rafId); rafId = 0; }
    else if (currentKind !== 'none' && canvas) { lastTime = performance.now(); rafId = requestAnimationFrame(draw); }
  });
  reducedMotion.addEventListener('change', sync);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();

  window.TravelThemeEffects = { sync };
})();
