(function () {
  const supportedBases = ['travel-classic', 'sanya-breeze'];
  const colorVariables = {
    background:'--tj-bg', surface:'--tj-surface', surfaceSoft:'--tj-surface-soft',
    primary:'--tj-primary', primarySoft:'--tj-primary-soft', accent:'--tj-accent',
    accentHover:'--tj-accent-hover', sand:'--tj-sand', text:'--tj-text',
    muted:'--tj-muted', border:'--tj-border', danger:'--tj-danger'
  };
  const managedVariables = [
    ...Object.values(colorVariables), '--tj-bg-glow', '--tj-shadow', '--tj-shadow-soft',
    '--tj-radius', '--tj-radius-small', '--tj-image-radius', '--tj-button-radius',
    '--tj-serif', '--tj-sans', '--tj-body-size', '--tj-body-line-height',
    '--tj-content-width', '--tj-article-width', '--el-color-primary',
    '--el-color-primary-dark-2', '--el-border-color', '--el-border-radius-base',
    '--el-bg-color', '--el-fill-color-blank', '--el-text-color-primary'
  ];
  const serif = '"Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif';
  const sans = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif';

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
    root.dataset.theme = theme.baseThemeKey;
    root.dataset.themeKey = theme.themeKey || theme.baseThemeKey;
    const definition = theme.definitionJson || {};
    const colors = definition.colors || {};
    Object.entries(colorVariables).forEach(([key,variable]) => {
      if (colors[key]) root.style.setProperty(variable, colors[key]);
    });
    if (colors.sand) root.style.setProperty('--tj-bg-glow', rgba(colors.sand,.30));
    if (colors.primary) {
      root.style.setProperty('--tj-shadow', `0 14px 40px ${rgba(colors.primary,.10)}`);
      root.style.setProperty('--tj-shadow-soft', `0 5px 20px ${rgba(colors.primary,.075)}`);
    }
    if (colors.accent) {
      root.style.setProperty('--el-color-primary', colors.accent);
      root.style.setProperty('--el-color-primary-dark-2', colors.accentHover || darker(colors.accent));
    }
    if (colors.border) root.style.setProperty('--el-border-color', colors.border);
    if (colors.surface) {
      root.style.setProperty('--el-bg-color', colors.surface);
      root.style.setProperty('--el-fill-color-blank', colors.surface);
    }
    if (colors.text) root.style.setProperty('--el-text-color-primary', colors.text);

    const typography = definition.typography || {};
    root.style.setProperty('--tj-serif', typography.headingFamily === 'sans' ? sans : serif);
    root.style.setProperty('--tj-sans', typography.bodyFamily === 'serif' ? serif : sans);
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
    root.dataset.density = layout.density || 'comfortable';
    root.dataset.homeLayout = layout.homeLayout || 'classic';
    const image = definition.image || {};
    root.dataset.imageStyle = image.style || 'natural';
    root.dataset.imageShadow = image.shadow || 'soft';
    root.dataset.imageRatio = image.defaultRatio || '16:9';
    root.dataset.motion = definition.motion?.level || 'subtle';
    if (options.persist !== false) {
      localStorage.setItem('travel-theme', theme.themeKey || theme.baseThemeKey);
      localStorage.setItem('travel-theme-config', JSON.stringify(theme));
    }
    return theme;
  }

  function stored() {
    try {
      const config = JSON.parse(localStorage.getItem('travel-theme-config') || 'null');
      return config || localStorage.getItem('travel-theme') || 'travel-classic';
    } catch (_) {
      return localStorage.getItem('travel-theme') || 'travel-classic';
    }
  }

  window.TravelTheme = { apply, normalize, stored, supportedBases };
})();
