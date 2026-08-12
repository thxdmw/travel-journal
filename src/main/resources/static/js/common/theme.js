(function () {
  // 基础视觉目前只剩 travel-classic。原先的 sanya-breeze 相对它只多一张首页封面图，
  // 而封面图已经改成每套主题自己上传，于是在 V6 迁移里下线了。
  const supportedBases = ['travel-classic'];
  const colorVariables = {
    background:'--tj-bg', surface:'--tj-surface', surfaceSoft:'--tj-surface-soft',
    primary:'--tj-primary', primarySoft:'--tj-primary-soft', secondary:'--tj-secondary',
    accent:'--tj-accent', accentHover:'--tj-accent-hover', sand:'--tj-sand', text:'--tj-text',
    muted:'--tj-muted', border:'--tj-border', danger:'--tj-danger',
    gradientFrom:'--tj-gradient-from', gradientTo:'--tj-gradient-to'
  };
  /**
   * 数值型 token 的单位。后端 SCHEMA 里新增数值项时，在这里补一行单位就能生效；
   * 变量名统一是 --tj-{section}-{key}（短横线化）。
   */
  const numericUnits = {
    'typography-letterSpacing':'em', 'typography-headingWeight':'',
    'typography-paragraphSpacing':'em', 'shape-borderWidth':'px',
    'layout-sectionGap':'', 'card-opacity':'', 'card-blur':'px',
    'background-intensity':'', 'image-maxHeight':'vh', 'gallery-columns':'',
    'gallery-gap':'px', 'map-routeWidth':'px',
    'decorations-opacity':'', 'ambient-intensity':''
  };
  const kebab = name => name.replace(/[A-Z]/g, ch => '-' + ch.toLowerCase());
  /** 切换主题前要清掉的变量。数值项直接从 numericUnits 推导，避免两处各写一遍漏掉。 */
  const managedVariables = [
    ...Object.values(colorVariables), '--tj-bg-glow', '--tj-shadow', '--tj-shadow-soft',
    '--tj-radius', '--tj-radius-small', '--tj-image-radius', '--tj-button-radius',
    '--tj-serif', '--tj-sans', '--tj-body-size', '--tj-body-line-height',
    '--tj-content-width', '--tj-article-width', '--el-color-primary',
    '--el-color-primary-dark-2', '--el-border-color', '--el-border-radius-base',
    '--el-bg-color', '--el-fill-color-blank', '--el-text-color-primary', '--el-mask-color',
    '--tj-hero-image', '--tj-bg-image', '--tj-route-color',
    ...Object.keys(numericUnits).map(name => '--tj-' + kebab(name))
  ];
  const fontStacks = {
    serif: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif',
    sans: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    rounded: '"PingFang SC", "Hiragino Maru Gothic GB", "Yuanti SC", "Quicksand", system-ui, sans-serif',
    mono: '"JetBrains Mono", "SFMono-Regular", Consolas, "Noto Sans Mono CJK SC", monospace'
  };
  function fontStack(name, fallback) { return fontStacks[name] || fontStacks[fallback]; }

  /**
   * 走通用映射的区块。colors 单独处理（要派生阴影等），其余全部按约定铺开。
   * 后面五个是 Theme Pack V2 新增的：装饰、分隔线、氛围、Block 皮肤和互动。
   */
  const genericSections = ['card', 'background', 'image', 'gallery', 'motion', 'effects', 'map', 'layout',
    'typography', 'shape', 'decorations', 'dividers', 'ambient', 'blockStyles', 'interactions', 'stickers', 'hero'];
  /** 切换主题前要清掉的 data-* 属性前缀，避免上一套主题的枚举值残留 */
  const managedDataPrefixes = genericSections.concat('colors');

  /**
   * 按统一约定把 token 铺成 CSS 变量和 data-* 属性：
   * 数值 → --tj-{section}-{key}（带单位），枚举/布尔 → <html data-{section}-{key}>。
   * 这样后端 SCHEMA 加一项，前端不用改代码，CSS 直接用新选择器接住即可。
   */
  function applyGenericTokens(root, definition) {
    genericSections.forEach(section => {
      const values = definition[section];
      if (!values || typeof values !== 'object') return;
      Object.entries(values).forEach(([key, value]) => {
        // mediaId 要拼成 url()，贴纸列表要生成 DOM，两者都走各自的专用逻辑
        if (value == null || key === 'mediaId' || typeof value === 'object') return;
        const name = section + '-' + key;
        if (typeof value === 'number') {
          const unit = numericUnits[name];
          if (unit == null) return;                    // 未登记单位的数值走各自的专用逻辑
          root.style.setProperty('--tj-' + kebab(name), value + unit);
        } else {
          root.dataset[section + key.charAt(0).toUpperCase() + key.slice(1)] =
            typeof value === 'boolean' ? (value ? 'on' : 'off') : String(value);
        }
      });
    });
  }

  function setMediaVariable(root, variable, mediaId) {
    if (Number.isInteger(mediaId) && mediaId > 0) {
      root.style.setProperty(variable, `url('/api/media/${mediaId}/display')`);
    }
  }

  function normalize(input) {
    if (!input) return { themeKey:'travel-classic', baseThemeKey:'travel-classic', definitionJson:{} };
    if (typeof input === 'string') {
      const base = supportedBases.includes(input) ? input : 'travel-classic';
      return { themeKey:input, baseThemeKey:base, definitionJson:{} };
    }
    const base = supportedBases.includes(input.baseThemeKey) ? input.baseThemeKey
      : (supportedBases.includes(input.themeKey) ? input.themeKey : 'travel-classic');
    return { ...input, baseThemeKey:base, definitionJson:input.definitionJson || {} };
  }

  function hexRgb(hex) {
    const value = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(value)) return null;
    return [parseInt(value.slice(0,2),16), parseInt(value.slice(2,4),16), parseInt(value.slice(4,6),16)];
  }

  function rgba(hex, alpha) {
    const rgb = hexRgb(hex);
    return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})` : null;
  }

  function darker(hex, amount=.16) {
    const rgb = hexRgb(hex);
    if (!rgb) return hex;
    return '#' + rgb.map(value => Math.max(0, Math.round(value * (1 - amount))).toString(16).padStart(2,'0')).join('').toUpperCase();
  }

  function apply(input, options={}) {
    const theme = normalize(input);
    const root = document.documentElement;
    managedVariables.forEach(name => root.style.removeProperty(name));
    // 上一套主题写过的枚举值必须先清掉：内置主题的配置里没有 card/effects 这些区块，
    // 不清理的话切回内置主题会残留前一套的玻璃卡片、雪花特效之类
    managedDataPrefixes.forEach(prefix => {
      Object.keys(root.dataset)
        .filter(name => name.startsWith(prefix) && name.length > prefix.length)
        .forEach(name => delete root.dataset[name]);
    });
    root.dataset.theme = theme.baseThemeKey;
    root.dataset.themeKey = theme.themeKey || theme.baseThemeKey;
    const definition = theme.definitionJson || {};
    const colors = definition.colors || {};
    Object.entries(colorVariables).forEach(([key,variable]) => {
      if (colors[key]) root.style.setProperty(variable, colors[key]);
    });
    if (colors.sand) root.style.setProperty('--tj-bg-glow', rgba(colors.sand,.30));
    if (colors.primary) {
      // 暗色基调下用主色调阴影几乎看不见，改用纯黑并加深，否则卡片会糊成一片
      const dark = colors.scheme === 'dark';
      const shadowBase = dark ? '#000000' : colors.primary;
      const strong = dark ? .55 : .10, soft = dark ? .34 : .075;
      root.style.setProperty('--tj-shadow', `0 14px 40px ${rgba(shadowBase,strong)}`);
      root.style.setProperty('--tj-shadow-soft', `0 5px 20px ${rgba(shadowBase,soft)}`);
    }
    // 地图路线色没单独设就跟随强调色，省得每套主题都要配一遍
    const routeColor = definition.map?.routeColor || colors.accent;
    if (routeColor) root.style.setProperty('--tj-route-color', routeColor);
    // 明暗基调。colors 区块不走通用映射（值都是十六进制色），scheme 单独铺一次
    root.dataset.scheme = colors.scheme === 'dark' ? 'dark' : 'light';
    if (colors.accent) {
      root.style.setProperty('--el-color-primary', colors.accent);
      root.style.setProperty('--el-color-primary-dark-2', colors.accentHover || darker(colors.accent));
    }
    if (colors.border) root.style.setProperty('--el-border-color', colors.border);
    if (colors.surface) {
      root.style.setProperty('--el-bg-color', colors.surface);
      root.style.setProperty('--el-fill-color-blank', colors.surface);
      // loading 遮罩默认是白色，压在暖色背景上会发突兀，这里跟着主题的内容背景走
      root.style.setProperty('--el-mask-color', rgba(colors.surface, .82));
    }
    if (colors.text) root.style.setProperty('--el-text-color-primary', colors.text);

    const typography = definition.typography || {};
    root.style.setProperty('--tj-serif', fontStack(typography.headingFamily, 'serif'));
    root.style.setProperty('--tj-sans', fontStack(typography.bodyFamily, 'sans'));
    if (typography.bodySize) root.style.setProperty('--tj-body-size', typography.bodySize + 'px');
    if (typography.lineHeight) root.style.setProperty('--tj-body-line-height', typography.lineHeight);

    const shape = definition.shape || {};
    if (shape.cardRadius != null) root.style.setProperty('--tj-radius', shape.cardRadius + 'px');
    if (shape.buttonRadius != null) {
      root.style.setProperty('--tj-radius-small', shape.buttonRadius + 'px');
      root.style.setProperty('--tj-button-radius', shape.buttonRadius + 'px');
      root.style.setProperty('--el-border-radius-base', shape.buttonRadius + 'px');
    }
    if (shape.imageRadius != null) root.style.setProperty('--tj-image-radius', shape.imageRadius + 'px');

    const layout = definition.layout || {};
    if (layout.contentWidth) root.style.setProperty('--tj-content-width', layout.contentWidth + 'px');
    if (layout.articleWidth) root.style.setProperty('--tj-article-width', layout.articleWidth + 'px');
    // density / homeLayout 沿用历史属性名，老 CSS 还在用；其余走下面的通用映射
    root.dataset.density = layout.density || 'comfortable';
    root.dataset.homeLayout = layout.homeLayout || 'editorial';
    const image = definition.image || {};
    root.dataset.imageStyle = image.style || 'natural';
    root.dataset.imageShadow = image.shadow || 'soft';
    root.dataset.imageRatio = image.defaultRatio || '16:9';
    root.dataset.motion = definition.motion?.level || 'subtle';

    applyGenericTokens(root, definition);

    // 图片背景和首页封面都只认 media id 拼出站内地址，不接受任意 URL——
    // 这两个值最终会进 CSS 的 url()，放开会变成注入点。没设置就不写变量，让基础主题兜底。
    setMediaVariable(root, '--tj-hero-image', definition.hero?.mediaId);
    setMediaVariable(root, '--tj-bg-image', definition.background?.mediaId);
    if (options.persist !== false) {
      localStorage.setItem('travel-theme', theme.themeKey || theme.baseThemeKey);
      localStorage.setItem('travel-theme-config', JSON.stringify(theme));
    }
    /*
     * 贴纸不能只靠 data-* 表达：它是一个列表，每一项都要变成页面上的一个元素。
     * 所以这里只把主题存下来并广播一声，具体铺进 DOM 的事交给 theme-effects.js——
     * theme.js 保持「只写 CSS 变量和属性、不碰 DOM 结构」这条边界。
     */
    active = theme;
    window.dispatchEvent(new CustomEvent('travel-theme-applied', { detail:theme }));
    return theme;
  }

  /** 当前生效的主题，供需要读取 stickers 这类结构化配置的模块使用。 */
  function current() { return active; }

  function stored() {
    try {
      const config = JSON.parse(localStorage.getItem('travel-theme-config') || 'null');
      return config || localStorage.getItem('travel-theme') || 'travel-classic';
    } catch (_) {
      return localStorage.getItem('travel-theme') || 'travel-classic';
    }
  }

  let active = null;

  /**
   * 当前生效主题的地图相关 token，供 day-route.js / public-app.js 传给 TravelMap。
   * Theme 不需要认识 AMap 或 Leaflet 的 API——它只把语义参数（颜色、粗细、标记
   * 样式、要不要动画）交出来，具体怎么画由各个 Provider 适配层自己决定。
   */
  function mapTokens() {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const color = style.getPropertyValue('--tj-route-color').trim() || undefined;
    const widthRaw = style.getPropertyValue('--tj-map-route-width').trim();
    const width = widthRaw ? parseFloat(widthRaw) : undefined;
    return {
      style: root.dataset.mapStyle || 'auto',
      color,
      width: Number.isFinite(width) ? width : undefined,
      markerStyle: root.dataset.mapMarkerStyle || 'dot',
      animateRoute: root.dataset.mapAnimateRoute === 'on'
    };
  }

  window.TravelTheme = { apply, normalize, stored, current, supportedBases, mapTokens };
})();
