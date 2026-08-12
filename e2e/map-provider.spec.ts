import { test, expect } from '@playwright/test';

/*
 * 地图 Provider 解析优先级：用户手动选择 > AUTO 按访客网络地区判定的结果。
 * 通过拦截 /api/public/runtime 模拟不同地区，配合 localStorage 验证
 * window.TravelMap.resolveProvider() 的行为——不需要真的加载高德或 OSM 瓦片。
 */
test.describe('地图 Provider 解析', () => {
  test.beforeEach(async ({ page }) => {
    // 避免测试环境真的去请求高德的外部脚本
    await page.route('https://webapi.amap.com/**', route => route.abort());
  });

  test('@smoke AUTO + 访客在中国大陆 → 解析为 AMAP', async ({ page }) => {
    await page.route('**/api/public/runtime', route => route.fulfill({
      json: { code: 'OK', message: 'success', data: { region: 'CN', mapProvider: 'AMAP', amapJsKey: 'test-key' } }
    }));
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('travel-map-provider'));
    const resolved = await page.evaluate(() => (window as any).TravelMap.resolveProvider());
    expect(resolved.provider).toBe('AMAP');
    expect(resolved.source).toBe('auto');
  });

  test('AUTO 判定为高德但部署未配置 JS Key 时使用 OSM', async ({ page }) => {
    await page.route('**/api/public/runtime', route => route.fulfill({
      json: { code: 'OK', message: 'success', data: { region: 'CN', mapProvider: 'AMAP', amapJsKey: '' } }
    }));
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('travel-map-provider'));

    const resolved = await page.evaluate(() => (window as any).TravelMap.resolveProvider());

    expect(resolved.provider).toBe('OSM');
    expect(resolved.source).toBe('auto');
  });

  test('AUTO + 访客在海外（非 CN）→ 解析为 OSM', async ({ page }) => {
    await page.route('**/api/public/runtime', route => route.fulfill({
      json: { code: 'OK', message: 'success', data: { region: 'JP', mapProvider: 'OSM', amapJsKey: '' } }
    }));
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('travel-map-provider'));
    const resolved = await page.evaluate(() => (window as any).TravelMap.resolveProvider());
    expect(resolved.provider).toBe('OSM');
    expect(resolved.source).toBe('auto');
  });

  test('@smoke 手动选择 OSM 时，即使 AUTO 判定是 AMAP 也保持 OSM', async ({ page }) => {
    await page.route('**/api/public/runtime', route => route.fulfill({
      json: { code: 'OK', message: 'success', data: { region: 'CN', mapProvider: 'AMAP', amapJsKey: 'test-key' } }
    }));
    await page.goto('/');
    await page.evaluate(() => (window as any).TravelMap.setManualProvider('OSM'));
    const resolved = await page.evaluate(() => (window as any).TravelMap.resolveProvider());
    expect(resolved.provider).toBe('OSM');
    expect(resolved.source).toBe('manual');
    await page.evaluate(() => (window as any).TravelMap.setManualProvider(null));
  });

  test('手动选择 AMAP 时，即使 AUTO 判定是 OSM 也保持 AMAP', async ({ page }) => {
    await page.route('**/api/public/runtime', route => route.fulfill({
      json: { code: 'OK', message: 'success', data: { region: 'JP', mapProvider: 'OSM', amapJsKey: '' } }
    }));
    await page.goto('/');
    await page.evaluate(() => (window as any).TravelMap.setManualProvider('AMAP'));
    const resolved = await page.evaluate(() => (window as any).TravelMap.resolveProvider());
    expect(resolved.provider).toBe('AMAP');
    expect(resolved.source).toBe('manual');
    await page.evaluate(() => (window as any).TravelMap.setManualProvider(null));
  });

  test('地图 Provider 手动选择开关在首页可见并可切换', async ({ page }) => {
    await page.route('**/api/public/runtime', route => route.fulfill({
      json: { code: 'OK', message: 'success', data: { region: 'CN', mapProvider: 'AMAP', amapJsKey: 'test-key' } }
    }));
    await page.goto('/');
    const switcher = page.locator('.map-provider-switch').first();
    await expect(switcher).toBeVisible();
    const buttons = switcher.locator('button');
    // 第一个按钮是「自动」，解析完成后会带上「（高德）」这样的后缀，所以按位置取而不是精确文本匹配
    const autoButton = buttons.nth(0), amapButton = buttons.nth(1), osmButton = buttons.nth(2);
    await expect(amapButton).toHaveText('高德');
    await expect(osmButton).toHaveText('OSM');
    await osmButton.click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('travel-map-provider'))).toBe('OSM');
    await expect(autoButton).toContainText('自动');
    await autoButton.click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('travel-map-provider'))).toBeNull();
  });

  test('从手动选择切回 AUTO 后会重新显示实际 Provider', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('travel-map-provider', 'OSM'));
    await page.route('**/api/public/runtime', route => route.fulfill({
      json: { code: 'OK', message: 'success', data: { region: 'CN', mapProvider: 'AMAP', amapJsKey: 'test-key' } }
    }));
    await page.route('https://tile.openstreetmap.org/**', route => route.abort());
    await page.goto('/');

    const switcher = page.locator('.map-provider-switch').first();
    const autoButton = switcher.locator('button').nth(0);
    await expect(switcher.locator('button').nth(2)).toHaveClass(/active/);
    await autoButton.click();

    await expect(autoButton).toContainText('高德');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('travel-map-provider'))).toBeNull();
  });

  test('同一容器快速连续建图会串行替换，不触发 Leaflet 重复初始化', async ({ page }) => {
    await page.route('**/api/public/runtime', route => route.fulfill({
      json: { code: 'OK', message: 'success', data: {
        region: 'JP', mapProvider: 'OSM', amapJsKey: '',
        osmTileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        osmAttribution: '© OpenStreetMap contributors',
      } }
    }));
    await page.route('https://tile.openstreetmap.org/**', route => route.abort());
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const host = document.createElement('div');
      host.style.cssText = 'width:320px;height:240px';
      document.body.appendChild(host);
      const api = (window as any).TravelMap;
      const [first, second] = await Promise.all([
        api.create(host, { provider: 'OSM', center: [30, 104], zoom: 6 }),
        api.create(host, { provider: 'OSM', center: [31, 103], zoom: 7 }),
      ]);
      const containers = host.querySelectorAll('.leaflet-pane').length;
      first.destroy(); // 已被第二次 create 自动销毁；重复 destroy 必须安全。
      second.destroy();
      host.remove();
      return { containers };
    });

    expect(result.containers).toBeGreaterThan(0);
  });

  test('可以按容器销毁临时重试创建的地图', async ({ page }) => {
    await page.route('**/api/public/runtime', route => route.fulfill({
      json: { code: 'OK', message: 'success', data: {
        region: 'JP', mapProvider: 'OSM', amapJsKey: '',
        osmTileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        osmAttribution: '© OpenStreetMap contributors',
      } }
    }));
    await page.route('https://tile.openstreetmap.org/**', route => route.abort());
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const host = document.createElement('div');
      host.style.cssText = 'width:320px;height:240px';
      document.body.appendChild(host);
      const api = (window as any).TravelMap;
      const map = await api.create(host, { provider: 'OSM', center: [30, 104], zoom: 6 });
      const before = host.querySelectorAll('.leaflet-pane').length;
      api.destroy(host);
      const after = host.querySelectorAll('.leaflet-pane').length;
      map.destroy(); // 显式实例销毁和容器兜底销毁都必须幂等。
      host.remove();
      return { before, after };
    });

    expect(result.before).toBeGreaterThan(0);
    expect(result.after).toBe(0);
  });
});
