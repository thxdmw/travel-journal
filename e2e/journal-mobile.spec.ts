import { test, expect } from '@playwright/test';
import { login, openNewJournal, paragraphs, writeParagraphs, waitSaved, isMobile } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('打开编辑器就有草稿 id，不必先填表', async ({ page }) => {
  const id = await openNewJournal(page);
  expect(id).toBeGreaterThan(0);
  // 标题、slug 都还没填，但状态已经是「已保存」——这正是「新建即草稿」要的效果
  await waitSaved(page);
  // 日期和城市是推出来的，不需要作者选
  await expect(page.locator('.editor-context')).not.toBeEmpty();
});

test('连续写三段，全程不弹任何窗', async ({ page }) => {
  await openNewJournal(page);
  const dialogs: string[] = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });

  await writeParagraphs(page, [
    '今天从京都站出来的时候下着一点雨。',
    '走到鸭川的时候突然放晴了。',
    '后来去了筑地市场，海胆比想象中甜。',
  ]);

  expect(await paragraphs(page)).toEqual([
    '今天从京都站出来的时候下着一点雨。',
    '走到鸭川的时候突然放晴了。',
    '后来去了筑地市场，海胆比想象中甜。',
  ]);
  expect(dialogs).toHaveLength(0);
  await expect(page.locator('.block-config-dialog')).toHaveCount(0);
});

test('段首退格与上一段合并', async ({ page }) => {
  await openNewJournal(page);
  await writeParagraphs(page, ['第一段。', '第二段。']);
  const second = page.locator('[data-inline-input]').last();
  await second.click();
  await second.press('Home');
  await second.press('Backspace');
  await expect.poll(() => paragraphs(page)).toEqual(['第一段。第二段。']);
});

test('不填标题也能存，刷新后内容还在', async ({ page }) => {
  const id = await openNewJournal(page);
  await writeParagraphs(page, ['测试自动保存的这一段。']);
  await waitSaved(page);

  await page.reload();
  await page.waitForURL(new RegExp(`#/journals/${id}`));
  await expect.poll(() => paragraphs(page), { timeout: 20_000 })
    .toEqual(['测试自动保存的这一段。']);
});

test('发布前会拦下空标题', async ({ page }) => {
  await openNewJournal(page);
  await writeParagraphs(page, ['正文有内容，但标题是空的。']);
  await waitSaved(page);

  if (isMobile(page)) await page.locator('.editor-more').click();
  await page.getByRole('button', { name: '发布日记' }).click();
  // 前端表单校验会指出必填项，后端也会再拦一道；无论哪层，状态都不该变成已发布
  await expect(page.locator('.el-form-item__error').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '更新发布' })).toHaveCount(0);
});

test('填好标题后可以发布', async ({ page }) => {
  await openNewJournal(page);
  await writeParagraphs(page, ['这一篇会被发布出去。']);
  if (isMobile(page)) await page.locator('.editor-more').click();
  await page.getByPlaceholder(/日记标题/).fill('E2E · ' + Date.now());
  await waitSaved(page);
  await page.getByRole('button', { name: '发布日记' }).click();
  await expect(page.getByRole('button', { name: '更新发布' })).toBeVisible({ timeout: 20_000 });
});

test('什么都不写就退出，不会留下空草稿', async ({ page }) => {
  const id = await openNewJournal(page);
  await waitSaved(page);
  await page.goto('/admin/#/trips');
  await page.waitForTimeout(1500);

  const res = await page.request.get(`/api/admin/journals/${id}`);
  expect(res.status(), '空草稿应当已经被回收').toBe(404);
});

test.describe('手机端布局', () => {
  test.skip(({ page }) => !isMobile(page), '只在手机视口下有意义');

  test('整页只有一条纵向滚动', async ({ page }) => {
    await openNewJournal(page);
    const scrollers = await page.locator('.editor-page, .editor-page *').evaluateAll(nodes =>
      nodes.filter(n => ['auto', 'scroll'].includes(getComputedStyle(n).overflowY))
           .map(n => n.className.toString().slice(0, 40)));
    // 允许 Bottom Sheet 内部有自己的滚动区，但正文链路上不能层层嵌套
    expect(scrollers.filter(c => !/meta-inner|media-side|config-form|tabs__content/.test(c))).toEqual(['editor-page']);
  });

  test('底部工具栏固定可见，不遮住正文', async ({ page }) => {
    await openNewJournal(page);
    const toolbar = page.locator('.editor-toolbar');
    await expect(toolbar).toBeVisible();
    const box = (await toolbar.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(Math.round(box.y + box.height)).toBeLessThanOrEqual(viewport.height + 1);
    await expect(page.locator('.editor-toolbar button')).toHaveCount(6);
  });

  test('顶部只留返回、保存状态和更多', async ({ page }) => {
    await openNewJournal(page);
    await expect(page.locator('.editor-top .editor-actions')).toBeHidden();
    await expect(page.locator('.editor-more')).toBeVisible();
    await expect(page.locator('.editor-save-state')).toBeVisible();
  });

  test('日记信息是从下方推上来的一层，退开就收起', async ({ page }) => {
    await openNewJournal(page);
    const sheet = page.locator('.editor-meta-group');
    await expect(sheet).not.toHaveClass(/is-open/);
    await page.locator('.editor-more').click();
    await expect(sheet).toHaveClass(/is-open/);
    await page.locator('.editor-sheet-backdrop').click();
    await expect(sheet).not.toHaveClass(/is-open/);
  });

  test('底部工具栏能直接插入标题和引用', async ({ page }) => {
    await openNewJournal(page);
    await writeParagraphs(page, ['先写一段正文。']);
    await page.locator('.editor-toolbar button', { hasText: '标题' }).click();
    await expect(page.locator('.block-inline--heading')).toHaveCount(1);
    // 不该弹配置窗，光标应当直接落在新标题上
    await expect(page.locator('.block-config-dialog')).toHaveCount(0);
    await expect(page.locator('.block-inline--heading textarea')).toBeFocused();
  });

  test('添加内容先给常用几项，正文不在其中', async ({ page }) => {
    await openNewJournal(page);
    await page.locator('.editor-toolbar button', { hasText: '内容' }).click();
    const quick = page.locator('.block-catalog--quick > button');
    await expect(quick).toHaveCount(8);
    await expect(quick.filter({ hasText: '正文' })).toHaveCount(0);
    await page.locator('.block-catalog-more').click();
    await expect(page.locator('.block-catalog > button')).toHaveCount(26);
  });
});
