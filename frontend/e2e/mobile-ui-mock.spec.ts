// Page 只当类型用，必须写 `type`：tsconfig 开了 verbatimModuleSyntax，
// 普通具名导入会被原样保留到 ESM 产物里，运行时报「没有导出 Page」并让整个用例集合不出来
import { test, expect, type Page } from '@playwright/test';

type BudgetRow = { id:number; code:string; name:string; planned:number; actual:number; remaining:number };

async function mockApi(page: Page, options: { standaloneJournal?: boolean } = {}) {
  const { standaloneJournal = false } = options;
  const budgetRows: BudgetRow[] = [
    { id: 11, code: 'FOOD', name: '餐饮', planned: 1200, actual: 360, remaining: 840 },
    { id: 12, code: 'TRAFFIC', name: '交通', planned: 1800, actual: 520, remaining: 1280 },
  ];
  const updatedIds: number[] = [];
  const trip = { id:1, title:'移动端测试旅行', slug:'mobile-test', summary:'用于验证手机布局', status:'ONGOING',
    startDate:'2026-08-01', endDate:'2026-08-31', defaultCurrency:'CNY', themeKey:null };
  const journal = { id:1, tripId:standaloneJournal ? null : 1, tripStopId:null, title:'', slug:'journal-mobile-test', excerpt:'',
    contentJson:{ schemaVersion:1, blocks:[] }, occurredOn:'2026-08-11', coverMediaId:null,
    status:'DRAFT', themeKey:null, templateId:null, templateVersion:null, tags:[] };

  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    let data: any = null;

    if (path === '/api/admin/auth/session') data = { id:1, username:'admin', displayName:'测试旅行者', themeKey:null };
    else if (path === '/api/public/profile') data = { theme:null };
    else if (path === '/api/public/csrf') data = {};
    else if (path === '/api/admin/trips' && method === 'GET') data = { items:[trip], page:1, pageSize:100, total:1 };
    else if (path === '/api/admin/trips/1' && method === 'GET') data = trip;
    else if (path === '/api/admin/trips/1/dashboard') data = { stopCount:2, itineraryCount:4, draftCount:1, publishedCount:3 };
    else if (path === '/api/admin/trips/1/stops') data = [
      { id:1, cityName:'成都', countryName:'中国', arrivalDate:'2026-08-02', departureDate:'2026-08-05' },
      { id:2, cityName:'都江堰青城山景区', countryName:'中国', arrivalDate:'2026-08-06', departureDate:'2026-08-08' },
    ];
    else if (path === '/api/admin/trips/1/itinerary') data = [];
    else if (path === '/api/admin/trips/1/expenses') data = [];
    else if (path === '/api/admin/trips/1/budget') {
      const plannedTotal = budgetRows.reduce((sum, row) => sum + Number(row.planned), 0);
      const actualTotal = budgetRows.reduce((sum, row) => sum + Number(row.actual), 0);
      data = { currency:'CNY', plannedTotal, actualTotal, remaining:plannedTotal-actualTotal,
        categories:budgetRows.map(row => ({ ...row, remaining:Number(row.planned)-Number(row.actual) })) };
    }
    else if (/^\/api\/admin\/budget-categories\/\d+$/.test(path) && method === 'PUT') {
      const id = Number(path.split('/').pop());
      const body = request.postDataJSON();
      const row = budgetRows.find(item => item.id === id)!;
      row.planned = Number(body.plannedAmount);
      updatedIds.push(id);
      data = row;
    }
    else if (path === '/api/admin/journal-templates') data = [];
    else if (path === '/api/admin/themes') data = [];
    else if (path === '/api/admin/journals/1/media') data = [];
    else if (path === '/api/admin/journals/1' && method === 'GET') data = journal;
    else if (path === '/api/admin/journals/1/draft' && method === 'PATCH') {
      Object.assign(journal, request.postDataJSON()); data = journal;
    }
    else if (path === '/api/admin/journals' && method === 'GET') data = { items:[], page:1, pageSize:100, total:0 };

    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ data }) });
  });
  return updatedIds;
}

test.describe('移动端 UI 隔离回归', () => {
  test.skip(({ page }) => (page.viewportSize()?.width ?? 0) > 780, '只验证手机布局');

  test('独立日记信息面板显示可选的旅行归属', async ({ page }) => {
    await mockApi(page, { standaloneJournal:true });
    await page.goto('/admin/#/journals/1');
    await expect(page.locator('.editor-context')).toContainText('未归入旅行');
    await page.locator('.editor-more').click();
    const tripSelect = page.locator('.editor-meta').first().locator('.el-select').first();
    await expect(tripSelect).toBeVisible();
    await expect(tripSelect).toContainText('所属旅行（可选）');
  });

  test('图片设置可到底、下拉复位、回车换行与离线提示关闭', async ({ page, context }) => {
    await mockApi(page);
    await page.goto('/admin/#/journals/1');
    const ghost = page.locator('.block-inline--ghost textarea');
    await expect(ghost).toBeVisible();
    await ghost.fill('第一行');
    const input = page.locator('[data-inline-input]').first();
    await input.press('End');
    await input.press('Enter');
    await input.type('第二行');
    await expect(input).toHaveValue('第一行\n第二行');
    await input.locator('xpath=..').getByRole('button', { name:'新增正文组件' }).click();
    await expect(page.locator('[data-inline-input]')).toHaveCount(2);

    await page.locator('.editor-toolbar button', { hasText:'内容' }).click();
    await page.locator('.block-catalog--quick > button').filter({ hasText:'单张图片' }).click();
    const dialog = page.locator('.block-config-dialog');
    const scroller = dialog.locator('.image-setting-tabs > .el-tabs__content');
    const footer = dialog.locator('.el-dialog__footer');
    for (const name of ['内容', '版式', '外观', '图注']) {
      await dialog.getByRole('tab', { name, exact:true }).click();
      await scroller.evaluate(element => { element.scrollTop = element.scrollHeight; });
      const last = dialog.locator('.el-tab-pane:visible .image-setting-section > *').last();
      const [lastBox, footerBox] = await Promise.all([last.boundingBox(), footer.boundingBox()]);
      expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(footerBox!.y + 1);
    }
    await dialog.getByRole('tab', { name:'外观', exact:true }).click();
    const effect = dialog.locator('.image-setting-section label').filter({ hasText:'电脑悬停效果' }).locator('.el-select');
    await effect.scrollIntoViewIfNeeded();
    const before = await scroller.evaluate(element => element.scrollTop);
    await effect.click();
    await scroller.evaluate(element => { element.scrollTop = Math.max(0, element.scrollTop - 36); });
    await page.locator('.el-select-dropdown__item').filter({ hasText:'轻轻浮起' }).click();
    await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBe(before);
    await dialog.getByRole('button', { name:'确认插入' }).click();
    await page.locator('.block-editor-card').last().dblclick();
    await expect(dialog.getByRole('button', { name:'确认修改' })).toBeVisible();
    await dialog.getByRole('button', { name:'取消' }).click();

    await context.setOffline(true);
    const banner = page.locator('.tj-offline-banner');
    await expect(banner).toHaveClass(/is-visible/);
    await banner.getByRole('button', { name:'关闭离线提示' }).click();
    await expect(banner).not.toHaveClass(/is-visible/);
    await context.setOffline(false);
  });

  test('工作台卡片不横向溢出，预算可全部保存', async ({ page }) => {
    const updatedIds = await mockApi(page);
    await page.goto('/admin/#/trips/1?tab=budget');
    await expect(page.locator('.workspace-mobile-list--budget .workspace-mobile-card')).toHaveCount(2);
    await expect(page.locator('.workspace-tabs .el-table')).toHaveCount(0);
    const inputs = page.locator('.workspace-mobile-list--budget .el-input__inner');
    await inputs.nth(0).fill('1500');
    await inputs.nth(1).fill('2200');
    await page.getByRole('button', { name:'全部保存' }).click();
    await expect.poll(() => updatedIds.slice().sort()).toEqual([11, 12]);
    const overflow = await page.locator('.workspace-tabs .el-tabs__content').evaluate(element => ({
      scrollWidth:element.scrollWidth, clientWidth:element.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

    await page.getByRole('tab', { name:'概览', exact:true }).click();
    await expect(page.locator('.dashboard-grid .metric')).toHaveCount(4);
    const metricsBox = await page.locator('.dashboard-grid').boundingBox();
    expect(metricsBox!.height).toBeLessThan(90);
  });

  test('模拟覆盖式软键盘后快捷组件光标会被顶到工具栏上方', async ({ page }) => {
    await mockApi(page);
    await page.goto('/admin/#/journals/1');
    for (let index = 0; index < 9; index++) {
      await page.locator('.editor-toolbar button', { hasText:'标题' }).click();
      await page.locator('.block-inline--heading textarea').last().fill('快捷标题 ' + index);
    }
    const input = page.locator('.block-inline--heading textarea').last();
    await expect(input).toBeFocused();
    await page.evaluate(() => {
      const viewport = window.visualViewport;
      if (!viewport) throw new Error('当前浏览器不支持 visualViewport');
      Object.defineProperty(viewport, 'height', { configurable:true, value:420 });
      viewport.dispatchEvent(new Event('resize'));
    });
    await expect.poll(async () => {
      const [inputBox, toolbarBox] = await Promise.all([
        input.boundingBox(), page.locator('.editor-toolbar').boundingBox(),
      ]);
      return !!inputBox && !!toolbarBox && inputBox.y + inputBox.height <= toolbarBox.y - 8;
    }).toBeTruthy();
  });
});
