import { expect, test } from '@playwright/test'

const trips = [
  { id: 7, createdAt: '2026-08-01T10:00:00+08:00', updatedAt: '2026-08-02T10:00:00+08:00', title: '京都四月', slug: 'kyoto-2026', summary: '樱花与小巷', status: 'PLANNING', startDate: '2026-04-01', endDate: '2026-04-08', defaultCurrency: 'JPY', coverMediaId: null, internalNote: null, themeKey: null },
]

test.describe('后台旅行列表 SFC', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      let data: unknown = null
      if (url.pathname === '/api/admin/auth/session') data = { id: 1, username: 'admin', displayName: '测试站长', avatarUrl: null, themeKey: null }
      else if (url.pathname === '/api/public/profile') data = { displayName: '测试站长', avatarUrl: null, themeKey: null, theme: null }
      else if (url.pathname === '/api/public/csrf') data = { token: 'test' }
      else if (url.pathname === '/api/admin/themes') data = []
      else if (url.pathname === '/api/admin/trips') {
        const keyword = url.searchParams.get('keyword') || ''
        const items = trips.filter(item => item.title.includes(keyword))
        data = { items, page: 1, pageSize: 100, total: items.length, totalPages: 1 }
      }
      await route.fulfill({ json: { code: 'OK', message: 'success', data } })
    })
  })

  test('加载旅行并按关键字查询空结果', async ({ page }) => {
    await page.goto('/admin/#/trips')
    await expect(page.locator('.admin-topbar h1')).toHaveText('旅行管理')
    await expect(page.locator('.admin-trip-card')).toContainText('京都四月')
    await page.getByPlaceholder('搜索旅行').fill('不存在')
    await page.getByRole('button', { name: '查询' }).click()
    await expect(page.getByText('还没有旅行')).toBeVisible()
  })

  test('打开新建和编辑弹窗并保留工作台导航', async ({ page }) => {
    await page.goto('/admin/#/trips')
    await page.getByRole('button', { name: '新建旅行' }).click()
    await expect(page.getByRole('dialog')).toContainText('新建旅行')
    await page.getByRole('button', { name: '取消' }).click()
    await page.locator('.admin-trip-card').getByRole('button', { name: '编辑' }).click()
    await expect(page.getByRole('dialog')).toContainText('编辑旅行')
    await expect(page.getByPlaceholder('例如：京都的四月')).toHaveValue('京都四月')
    await page.getByRole('button', { name: '取消' }).click()
    await page.locator('.admin-trip-card').click()
    await expect(page).toHaveURL(/#\/trips\/7$/)
  })
})
