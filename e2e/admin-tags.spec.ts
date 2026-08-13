import { expect, test } from '@playwright/test'

test.describe('后台标签管理 SFC', () => {
  test.beforeEach(async ({ page }) => {
    let tags = [
      { id: 1, name: '山野', slug: 'mountain', journalCount: 2 },
      { id: 2, name: '待整理', slug: 'unused', journalCount: 0 },
    ]
    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      let data: unknown = null
      if (path === '/api/admin/auth/session') data = { id: 1, username: 'admin', displayName: '测试站长', avatarUrl: null, themeKey: null }
      else if (path === '/api/public/profile') data = { displayName: '测试站长', avatarUrl: null, themeKey: null, theme: null }
      else if (path === '/api/public/csrf') data = { token: 'test' }
      else if (path === '/api/admin/journals/tags/purge-unused') {
        const before = tags.length
        tags = tags.filter(tag => tag.journalCount > 0)
        data = before - tags.length
      } else if (path === '/api/admin/journals/tags/1' && request.method() === 'PUT') {
        const body = request.postDataJSON() as { name: string }
        tags = tags.map(tag => tag.id === 1 ? { ...tag, name: body.name } : tag)
        data = 1
      } else if (path === '/api/admin/journals/tags') data = tags
      await route.fulfill({ json: { code: 'OK', message: 'success', data } })
    })
  })

  test('加载标签并在表格中完成改名', async ({ page }) => {
    await page.goto('/admin/#/tags')
    await expect(page.locator('.admin-topbar h1')).toHaveText('标签管理')
    const row = page.locator('.el-table__body tr').filter({ hasText: 'mountain' })
    await expect(row).toContainText('mountain')
    await row.getByRole('button', { name: '改名' }).click()
    await row.getByRole('textbox').fill('高山')
    await row.getByRole('button', { name: '保存' }).click()
    await expect(page.locator('.el-table__body')).toContainText('高山')
    await expect(page.getByText('标签已更新')).toBeVisible()
  })

  test('确认后清理无引用标签', async ({ page }) => {
    await page.goto('/admin/#/tags')
    await expect(page.locator('.el-table__body')).toContainText('待整理')
    await page.getByRole('button', { name: '清理无引用标签' }).click()
    await page.getByRole('button', { name: '确定' }).click()
    await expect(page.locator('.el-table__body')).not.toContainText('待整理')
    await expect(page.getByText('已清理 1 个空标签')).toBeVisible()
  })
})
