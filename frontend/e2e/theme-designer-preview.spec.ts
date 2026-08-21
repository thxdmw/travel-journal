import { test, expect } from '@playwright/test';
import { login } from './helpers';

const ADMIN_PASS_CONFIGURED = Boolean(process.env.E2E_ADMIN_PASS);

async function mockThemeStudio(page: import('@playwright/test').Page) {
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: any = null;
    if (path === '/api/admin/auth/session') {
      data = { id: 1, username: 'admin', displayName: '主题测试用户', themeKey: null };
    } else if (path === '/api/public/profile') {
      data = { theme: null };
    } else if (path === '/api/public/runtime') {
      data = { region: 'JP', mapProvider: 'OSM', amapJsKey: '',
        osmTileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        osmAttribution: '© OpenStreetMap contributors' };
    } else if (path === '/api/admin/themes/site-state') {
      data = { mode: 'AUTO', season: '夏', seasonThemeKey: null, theme: null };
    } else if (path === '/api/admin/themes') {
      data = [];
    }
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ code: 'OK', message: 'success', data }) });
  });
}

/*
 * 主题设计器右侧预览曾经只有首页一个场景，但主题设置里很多 Token 根本不作用于
 * 首页（正文行高、引用皮肤、路线粗细……），导致用户分不清「设置没生效」还是
 * 「当前预览没有对应元素」。这套用例验证三场景预览（首页/日记/地图）都能正常
 * 加载各自的固定示例内容，并且修改对应分组的设置后预览会收到主题更新。
 */

test.describe('主题设计器三场景预览', () => {
  test.beforeEach(async ({ page }) => {
    if (ADMIN_PASS_CONFIGURED) await login(page);
    else await mockThemeStudio(page);
    await page.goto('/admin/#/themes');
    await page.getByRole('button', { name: '新建设计' }).click();
    await expect(page.locator('.theme-designer-dialog')).toBeVisible();
  });

  test('@smoke 首页、日记、地图三个场景都能正常加载各自的固定示例内容', async ({ page }) => {
    const dialog = page.locator('.theme-designer-dialog');
    const frame = dialog.frameLocator('.theme-live iframe');

    // 默认首页场景：Hero + 6 张示例日记卡片 + 统计卡
    await expect(frame.locator('.hero-copy h1')).toBeVisible();
    await expect(frame.locator('[data-theme-preview-fixture="home"]')).toBeVisible();
    await expect(frame.locator('.card-grid .journal-card')).toHaveCount(6);
    await expect(frame.locator('.stats-grid .stat')).toHaveCount(4);
    await expect(dialog.locator('.theme-live-title')).toContainText('固定示例数据');
    await expect(frame.locator('.theme-preview-fixed-badge')).toContainText('不读取站点内容');
    // 预览模式不读取真实个人资料/头像，固定显示 Fixture 标识。
    await expect(frame.locator('.theme-preview-header .admin-link')).toHaveText('示');
    await expect(frame.locator('.theme-preview-header .public-nav')).toContainText('首页');

    // 日记场景：固定示例日记，覆盖开场卡、章节、地点卡、时间线、图片组等区块
    await dialog.locator('.theme-live-scenes button', { hasText: '日记' }).click();
    await expect(frame.locator('.journal-document')).toBeVisible();
    await expect(frame.locator('[data-theme-preview-fixture="journal"]')).toBeVisible();
    await expect(frame.locator('.journal-block--day-opener')).toBeVisible();
    await expect(frame.locator('.journal-block--chapter')).toBeVisible();
    await expect(frame.locator('.journal-block--location-card')).toBeVisible();
    await expect(frame.locator('.journal-gallery img')).toHaveCount(3);

    // 地图场景：固定四点路线（成都→都江堰→青城山→成都）
    await dialog.locator('.theme-live-scenes button', { hasText: '地图' }).click();
    await expect(frame.locator('.map-box')).toBeVisible();
    await expect(frame.locator('[data-theme-preview-fixture="map"]')).toBeVisible();
    await expect(frame.locator('.route-marker')).toHaveCount(4);
    await expect(frame.locator('.leaflet-overlay-pane path')).toHaveCount(1);
  });

  test('修改日记分组的设置后，日记预览会收到主题更新', async ({ page }) => {
    const dialog = page.locator('.theme-designer-dialog');
    await dialog.locator('.theme-live-scenes button', { hasText: '日记' }).click();
    const frame = dialog.frameLocator('.theme-live iframe');
    await expect(frame.locator('.journal-document')).toBeVisible();

    await dialog.locator('.advanced-toggle > summary').click();
    const dividerGroup = dialog.locator('.advanced-group').filter({ hasText: '章节分隔线' });
    await dividerGroup.locator(':scope > summary').click();
    const dividerStyleSelect = dialog.locator('.theme-setting-grid label', { hasText: '线条样式' }).locator('.el-select');
    await dividerStyleSelect.click();
    await page.getByRole('option', { name: '虚线' }).click();

    await expect.poll(() => frame.locator('html').getAttribute('data-dividers-style')).toBe('dashed');
  });

  test('修改地图分组的设置后，地图预览会收到主题更新', async ({ page }) => {
    const dialog = page.locator('.theme-designer-dialog');
    await dialog.locator('.theme-live-scenes button', { hasText: '地图' }).click();
    const frame = dialog.frameLocator('.theme-live iframe');
    await expect(frame.locator('.map-box')).toBeVisible();

    await dialog.locator('.advanced-toggle > summary').click();
    const mapGroup = dialog.locator('.advanced-group').filter({ hasText: '地图视觉' });
    await mapGroup.locator(':scope > summary').click();
    const markerStyleSelect = dialog.locator('.theme-setting-grid label', { hasText: '标记样式' }).locator('.el-select');
    await markerStyleSelect.click();
    await page.getByRole('option', { name: '水滴' }).click();

    await expect.poll(() => frame.locator('html').getAttribute('data-map-marker-style')).toBe('pin');
  });

  test('图片和 Gallery Fixture 不写局部覆盖，主题默认设置可直接观察', async ({ page }) => {
    const dialog = page.locator('.theme-designer-dialog');
    await dialog.locator('.theme-live-scenes button', { hasText: '日记' }).click();
    const frame = dialog.frameLocator('.theme-live iframe');
    await expect(frame.locator('.journal-figure')).not.toHaveClass(/journal-figure--medium/);
    await expect(frame.locator('.journal-gallery')).not.toHaveClass(/journal-gallery--grid/);
    await expect(frame.locator('.journal-gallery')).not.toHaveClass(/journal-gallery--cols-/);
  });

  /*
   * 挑的这一对必须真的在同一行，否则宽屏那条断言测的就不是「对齐」而是「换行了没有」。
   * 「圆角」这一组正好只有两个数值项，两列网格下必定并排。
   */
  test('主题数值输入控件等宽对齐', async ({ page }) => {
    const dialog = page.locator('.theme-designer-dialog');
    const shape = dialog.locator('details').filter({ hasText: '圆角' });
    await shape.locator('summary').click();
    const cardRadius = shape.locator('.setting-field', { hasText: '卡片圆角' }).locator('.el-input-number');
    const buttonRadius = shape.locator('.setting-field', { hasText: '按钮圆角' }).locator('.el-input-number');
    const [a, b] = await Promise.all([cardRadius.boundingBox(), buttonRadius.boundingBox()]);
    expect(a).not.toBeNull(); expect(b).not.toBeNull();
    expect(Math.abs(a!.width - b!.width)).toBeLessThan(1);
    expect(Math.abs(a!.height - b!.height)).toBeLessThan(1);
    if ((page.viewportSize()?.width ?? 0) > 1180) {
      expect(Math.abs(a!.y - b!.y)).toBeLessThan(1);
    } else {
      expect(Math.abs(a!.x - b!.x)).toBeLessThan(1);
    }
  });

  /*
   * 加减按钮曾经只有 15px 高，摆在 42px 的输入框里上下各贴一边，中间空出一条缝。
   * 现在两个按钮各占一半首尾相接，并且整体让开那 1px 边框——压上去就会把输入框
   * 右侧那段圆角边框盖掉。这里量的就是这两件事。
   */
  test('数值输入的加减按钮首尾相接，且不压住输入框边框', async ({ page }) => {
    const dialog = page.locator('.theme-designer-dialog');
    const typography = dialog.locator('details').filter({ hasText: '字体与排版' });
    await typography.locator('summary').click();
    const field = typography.locator('.setting-field', { hasText: '正文行高' });
    const [box, increase, decrease] = await Promise.all([
      field.locator('.el-input__wrapper').boundingBox(),
      field.locator('.el-input-number__increase').boundingBox(),
      field.locator('.el-input-number__decrease').boundingBox(),
    ]);
    expect(box).not.toBeNull(); expect(increase).not.toBeNull(); expect(decrease).not.toBeNull();
    // 上按钮的下边缘就是下按钮的上边缘，中间没有缝
    expect(Math.abs(increase!.y + increase!.height - decrease!.y)).toBeLessThan(1);
    // 三边都正好让开 1px 边框：压住了会盖掉圆角，留多了又会露出输入框的底色
    const inset = [
      increase!.y - box!.y,
      box!.y + box!.height - (decrease!.y + decrease!.height),
      box!.x + box!.width - (decrease!.x + decrease!.width),
    ];
    for (const gap of inset) {
      expect(gap).toBeGreaterThanOrEqual(0.5);
      expect(gap).toBeLessThanOrEqual(2);
    }
    // 两个按钮加起来填满边框以内的高度
    expect(increase!.height + decrease!.height).toBeGreaterThanOrEqual(box!.height - 3);
  });
});
