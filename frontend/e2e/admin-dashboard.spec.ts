import { expect, test } from '@playwright/test'

const journals = [
  { id: 1, createdAt: '2026-08-01T10:00:00+08:00', updatedAt: '2026-08-02T10:00:00+08:00', tripId: null, tripStopId: null, title: '京都清晨', slug: 'kyoto', excerpt: null, contentJson: null, status: 'DRAFT', occurredOn: '2026-08-01', coverMediaId: null, publishedAt: null, themeKey: null, templateId: null, templateVersion: null, tags: null },
  { id: 2, createdAt: '2026-08-01T10:00:00+08:00', updatedAt: '2026-08-02T10:00:00+08:00', tripId: null, tripStopId: null, title: '青城山', slug: 'qingcheng', excerpt: null, contentJson: null, status: 'PUBLISHED', occurredOn: '2026-08-02', coverMediaId: null, publishedAt: '2026-08-03T10:00:00+08:00', themeKey: null, templateId: null, templateVersion: null, tags: null },
]

test.describe('后台管理首页 SFC', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      let data: unknown = null
      if (path === '/api/admin/auth/session') data = { id: 1, username: 'admin', displayName: '测试站长', avatarUrl: null, themeKey: null }
      else if (path === '/api/public/profile') data = { displayName: '测试站长', avatarUrl: null, themeKey: null, theme: null }
      else if (path === '/api/public/csrf') data = { token: 'test' }
      else if (path === '/api/admin/trips') data = { items: [], page: 1, pageSize: 100, total: 3, totalPages: 1 }
      else if (path === '/api/admin/journals') data = { items: journals, page: 1, pageSize: 100, total: 2, totalPages: 1 }
      await route.fulfill({ json: { code: 'OK', message: 'success', data } })
    })
  })

  test('加载统计和最近编辑，并保留后台应用壳', async ({ page }) => {
    await page.goto('/admin/#/')
    await expect(page.locator('.admin-topbar h1')).toHaveText('管理首页')
    await expect(page.locator('.dashboard-grid .metric strong')).toHaveText(['3', '1', '1', '远行手记'])
    await expect(page.locator('.el-table')).toContainText('京都清晨')
    await expect(page.locator('.el-table')).toContainText('青城山')
    await expect(page.locator('.admin-sidebar')).toBeVisible()
  })

  test('管理旅行按钮进入既有旅行管理路由', async ({ page }) => {
    await page.goto('/admin/#/')
    await page.getByRole('button', { name: '管理旅行' }).click()
    await expect(page).toHaveURL(/#\/trips$/)
    await expect(page.locator('.admin-topbar h1')).toHaveText('旅行管理')
  })
})
