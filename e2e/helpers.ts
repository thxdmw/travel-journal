import { Page, expect } from '@playwright/test';

export const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
export const ADMIN_PASS = process.env.E2E_ADMIN_PASS || '';

/** 登录后台。后台是 hash 路由的单页应用，登录成功会跳到 #/ 。 */
export async function login(page: Page) {
  await page.goto('/admin/');
  if (!page.url().includes('#/login')) await page.waitForURL(/#\/(login)?/);
  if (page.url().includes('#/login')) {
    await page.getByPlaceholder(/用户名/).fill(ADMIN_USER);
    await page.getByPlaceholder(/密码/).fill(ADMIN_PASS);
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page).not.toHaveURL(/#\/login/, { timeout: 15_000 });
  }
}

/** 为全新 CI 数据库准备一次旅行；已有数据时直接复用第一条。 */
export async function ensureTrip(page: Page) {
  return page.evaluate(async () => {
    const api = (window as any).TravelApi.admin;
    const existing = await api.trips({ page: 1, pageSize: 1 });
    if (existing.items?.length) return Number(existing.items[0].id);
    const stamp = Date.now();
    const trip = await api.createTrip({
      title: 'E2E 移动端旅程', slug: `e2e-mobile-${stamp}`, summary: '自动化测试专用',
      status: 'ONGOING', startDate: '2026-08-01', endDate: '2026-08-31',
      defaultCurrency: 'CNY', coverMediaId: null, internalNote: '可清理', themeKey: null,
    });
    return Number(trip.id);
  });
}

/** 创建一条隔离旅行，适合会生成 Moment / 日记等关联数据的测试。 */
export async function createTestTrip(page: Page, name = 'E2E 随手记旅程') {
  return page.evaluate(async ({ title, stamp }) => {
    const trip = await (window as any).TravelApi.admin.createTrip({
      title, slug: `e2e-smoke-${stamp}`, summary: '自动化测试专用', status: 'ONGOING',
      startDate: '2099-01-01', endDate: '2099-01-31', defaultCurrency: 'CNY',
      coverMediaId: null, internalNote: '可清理', themeKey: null,
    });
    return Number(trip.id);
  }, { title: name, stamp: Date.now() });
}

/** 打开一篇新日记。编辑器会自己去后端要一个草稿 id，URL 上的 new 会被换成真实 id。 */
export async function openNewJournal(page: Page, tripId?: number) {
  tripId = tripId || await ensureTrip(page);
  await page.goto(`/admin/#/journals/new${tripId ? `?tripId=${tripId}` : ''}`);
  await page.waitForURL(/#\/journals\/\d+/, { timeout: 20_000 });
  return Number(page.url().match(/#\/journals\/(\d+)/)![1]);
}

/** 当前正文里的所有 inline 段落文本。 */
export async function paragraphs(page: Page) {
  return page.locator('[data-inline-input]').evaluateAll(nodes =>
    nodes.map(n => (n as HTMLTextAreaElement).value));
}

/** 往正文里连续写几个正文组件；回车现在留给组件内部换行。 */
export async function writeParagraphs(page: Page, texts: string[]) {
  const ghost = page.locator('.block-inline--ghost textarea');
  if (await ghost.count()) {
    await ghost.click();
    await ghost.fill(texts[0]);
    texts = texts.slice(1);
  }
  for (const text of texts) {
    const last = page.locator('[data-inline-input]').last();
    await last.click();
    await last.locator('xpath=..').getByRole('button', { name: '新增正文组件' }).click();
    await page.locator('[data-inline-input]').last().fill(text);
  }
}

/** 等自动保存落地（顶部状态回到「已保存」）。 */
export async function waitSaved(page: Page) {
  await expect(page.locator('.editor-save-state')).toHaveText(/已保存/, { timeout: 20_000 });
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) <= 780;
