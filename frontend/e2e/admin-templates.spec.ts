import { expect, test } from '@playwright/test'

const template = { id: 1, createdAt: '2026-08-01T10:00:00+08:00', updatedAt: '2026-08-01T10:00:00+08:00', name: '慢游模板', description: '记录慢旅行', category: 'CUSTOM', version: 1, enabled: true, builtin: false, definitionJson: { title: '慢游模板', blocks: [{ id: 'text-1', type: 'text', title: '今日故事', required: false, config: { placeholder: '写下这一段' } }] } }

test.describe('后台日记模板 SFC', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      let data: unknown = null
      if (path === '/api/admin/auth/session') data = { id: 1, username: 'admin', displayName: '测试站长', avatarUrl: null, themeKey: null }
      else if (path === '/api/public/profile') data = { displayName: '测试站长', avatarUrl: null, themeKey: null, theme: null }
      else if (path === '/api/public/csrf') data = { token: 'test' }
      else if (path === '/api/admin/journal-templates') data = [template]
      await route.fulfill({ json: { code: 'OK', message: 'success', data } })
    })
  })

  /*
   * 预览走的是 article-preview-body —— 和日记编辑器的「预览全文」同一套整屏排版。
   * 弹窗版会把正文压到对话框宽度里，而图片每一档宽度都相对正文宽度算，看到的就不是发布后的大小。
   * 顺带守住老模板里的 text 被读成正文：fixture 故意仍用已下线的类型名。
   */
  test('加载模板并打开安全示例预览', async ({ page }) => {
    await page.goto('/admin/#/templates')
    await expect(page.locator('.admin-topbar h1')).toHaveText('日记模板')
    await expect(page.locator('.template-card')).toContainText('慢游模板')
    await page.locator('.template-card').getByRole('button', { name: '预览' }).click()
    await expect(page.getByRole('dialog')).toContainText('慢游模板 · 预览')
    await expect(page.locator('.article-preview-body')).toContainText('路上的风')
  })

  test('新建模板时添加区块并显示实时预览', async ({ page }) => {
    await page.goto('/admin/#/templates')
    await page.getByRole('button', { name: '新建我的模板' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('新建我的模板')
    // 区块名和「添加区块」目录一致：以前这里叫「单行文字」，编辑器里却叫「正文」
    await dialog.getByRole('button', { name: /＋ 正文/ }).click()
    await expect(dialog.locator('.template-block-editor')).toContainText('正文')

    // 宽屏并排放整篇预览；窄屏容不下正文宽度，改成一个按钮开整屏预览
    const width = page.viewportSize()?.width ?? 0
    if (width > 780) {
      await expect(dialog.locator('.template-live-preview')).toContainText('路上的风')
    } else {
      await expect(dialog.locator('.template-live-preview')).toHaveCount(0)
      await dialog.getByRole('button', { name: /预览这份模板/ }).click()
      await expect(page.locator('.article-preview-body')).toContainText('路上的风')
    }
  })
})
