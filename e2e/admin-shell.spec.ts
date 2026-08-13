import { expect, test } from '@playwright/test'

test.describe('后台应用壳 SFC', () => {
  test('未登录访问业务页会由守卫跳转登录', async ({ page }) => {
    await page.route('**/api/admin/auth/session', route => route.fulfill({ json: { code: 'OK', message: 'success', data: null } }))
    await page.goto('/admin/#/trips')
    await expect(page).toHaveURL(/#\/login$/)
    await expect(page.locator('.login-card h2')).toHaveText('欢迎回来')
    await expect(page.locator('.admin-shell')).toHaveCount(0)
  })

  test('侧栏折叠状态持久化且路由标题随页面更新', async ({ page }) => {
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      let data: unknown = null
      if (path === '/api/admin/auth/session') data = { id: 1, username: 'admin', displayName: '测试站长', avatarUrl: null, themeKey: null }
      else if (path === '/api/public/profile') data = { displayName: '测试站长', avatarUrl: null, themeKey: null, theme: null }
      else if (path === '/api/public/csrf') data = { token: 'test' }
      else if (path === '/api/admin/trips') data = { items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 }
      else if (path === '/api/admin/journals') data = { items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 }
      else if (path === '/api/admin/themes') data = []
      else if (path === '/api/admin/journals/tags') data = []
      await route.fulfill({ json: { code: 'OK', message: 'success', data } })
    })
    await page.goto('/admin/#/')
    await expect(page.locator('.admin-topbar h1')).toHaveText('管理首页')
    const collapse = page.locator('.sidebar-collapse')
    if (await collapse.isVisible()) {
      await collapse.click()
      await expect(page.locator('body')).toHaveClass(/sidebar-collapsed/)
      expect(await page.evaluate(() => localStorage.getItem('travel-journal.sidebar'))).toBe('collapsed')
    } else {
      await page.locator('.mobile-toggle').click()
      await expect(page.locator('.admin-sidebar')).toHaveClass(/open/)
    }
    await page.locator('.side-nav a[title="标签管理"]').click()
    await expect(page.locator('.admin-topbar h1')).toHaveText('标签管理')
  })
})
