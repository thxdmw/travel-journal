import { test, expect } from '@playwright/test';

/*
 * 三个 Theme Preview 场景是公开的固定 Fixture，不需要管理员会话。把基础加载和
 * 「不读取真实业务数据」放在这组无鉴权测试里，避免本地没配 E2E 密码时完全失去覆盖。
 */
test.describe('主题固定预览 Fixture', () => {
  test('@smoke 首页固定示例包含 Hero、6 张卡片、统计与明确标识', async ({ page }) => {
    const businessRequests: string[] = [];
    page.on('request', request => {
      if (/\/api\/public\/(home|profile|journals|trips|map\/cities)/.test(request.url())) {
        businessRequests.push(request.url());
      }
    });
    // 兼容旧的 query-only 入口；即便没有 Studio 使用的 hash，也必须只显示 Fixture。
    await page.goto('/?theme-preview=1&scene=home');

    await expect(page.locator('[data-theme-preview-fixture="home"]')).toBeVisible();
    await expect(page.locator('.hero-copy h1')).toBeVisible();
    await expect(page.locator('.card-grid .journal-card')).toHaveCount(6);
    await expect(page.locator('.stats-grid .stat')).toHaveCount(4);
    await expect(page.locator('.theme-preview-fixed-badge')).toContainText('不读取站点内容');
    await expect(page.locator('.theme-preview-header')).toBeVisible();
    expect(businessRequests).toEqual([]);
  });

  test('日记固定示例覆盖主题化区块，图片与 Gallery 不写局部布局覆盖', async ({ page }) => {
    await page.goto('/?theme-preview=1&scene=journal');

    await expect(page.locator('[data-theme-preview-fixture="journal"]')).toBeVisible();
    await expect(page.locator('.journal-block--day-opener')).toBeVisible();
    await expect(page.locator('.journal-block--chapter')).toBeVisible();
    await expect(page.locator('.journal-block--quote')).toBeVisible();
    await expect(page.locator('.journal-block--callout')).toBeVisible();
    await expect(page.locator('.journal-block--location-card')).toBeVisible();
    await expect(page.locator('.journal-block--timeline')).toBeVisible();
    await expect(page.locator('.journal-block--stats')).toBeVisible();
    await expect(page.locator('.journal-gallery img')).toHaveCount(3);
    await expect(page.locator('.journal-figure')).not.toHaveClass(/journal-figure--medium/);
    await expect(page.locator('.journal-gallery')).not.toHaveClass(/journal-gallery--grid/);
    await expect(page.locator('.journal-gallery')).not.toHaveClass(/journal-gallery--cols-/);
  });

  test('地图固定示例包含四个点和一条路线', async ({ page }) => {
    await page.goto('/?theme-preview=1&scene=map');

    await expect(page.locator('[data-theme-preview-fixture="map"]')).toBeVisible();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(page.locator('.route-marker')).toHaveCount(4);
    await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);
  });
});
