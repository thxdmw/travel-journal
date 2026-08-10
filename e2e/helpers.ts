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

/** 打开一篇新日记。编辑器会自己去后端要一个草稿 id，URL 上的 new 会被换成真实 id。 */
export async function openNewJournal(page: Page, tripId?: number) {
  await page.goto(`/admin/#/journals/new${tripId ? `?tripId=${tripId}` : ''}`);
  await page.waitForURL(/#\/journals\/\d+/, { timeout: 20_000 });
  return Number(page.url().match(/#\/journals\/(\d+)/)![1]);
}

/** 当前正文里的所有 inline 段落文本。 */
export async function paragraphs(page: Page) {
  return page.locator('[data-inline-input]').evaluateAll(nodes =>
    nodes.map(n => (n as HTMLTextAreaElement).value));
}

/** 往正文里连续写几段，用回车分段——这正是移动端最常走的路径。 */
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
    await last.press('End');
    await last.press('Enter');
    await page.locator('[data-inline-input]').last().fill(text);
  }
}

/** 等自动保存落地（顶部状态回到「已保存」）。 */
export async function waitSaved(page: Page) {
  await expect(page.locator('.editor-save-state')).toHaveText(/已保存/, { timeout: 20_000 });
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) <= 780;
