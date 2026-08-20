import { expect, test } from '@playwright/test'

test.describe('后台登录页 SFC', () => {
  test('提交认证后初始化主题和 CSRF 并进入管理首页', async ({ page }) => {
    const calls: string[] = []
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      calls.push(path)
      let data: unknown = null
      if (path === '/api/admin/auth/session') data = null
      else if (path === '/api/admin/auth/login') data = { id: 1, username: 'admin', displayName: '测试站长', avatarUrl: null, themeKey: 'preset-spring' }
      else if (path === '/api/public/profile') data = { displayName: '测试站长', avatarUrl: null, themeKey: 'preset-spring', theme: null }
      else if (path === '/api/public/csrf') data = { token: 'test' }
      else if (path === '/api/admin/trips') data = { items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 }
      else if (path === '/api/admin/journals') data = { items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 }
      await route.fulfill({ json: { code: 'OK', message: 'success', data } })
    })

    await page.goto('/admin/#/login')
    await expect(page.locator('.login-card h2')).toHaveText('欢迎回来')
    await page.getByPlaceholder('密码').fill('secret')
    await page.getByRole('button', { name: '登录' }).click()
    await expect(page).toHaveURL(/\/admin\/(?:index\.html)?#\/$/)
    await expect(page.locator('.admin-topbar h1')).toHaveText('管理首页')
    expect(calls).toContain('/api/admin/auth/login')
    expect(calls).toContain('/api/public/profile')
    expect(calls).toContain('/api/public/csrf')
  })

  test('认证失败时停留登录页并恢复提交按钮', async ({ page }) => {
    await page.route('**/api/admin/auth/session', route => route.fulfill({ json: { code: 'OK', message: 'success', data: null } }))
    await page.route('**/api/admin/auth/login', route => route.fulfill({ status: 401, json: { code: 'UNAUTHORIZED', message: '用户名或密码错误', data: null } }))
    await page.goto('/admin/#/login')
    const button = page.getByRole('button', { name: '登录' })
    await button.click()
    await expect(page).toHaveURL(/#\/login$/)
    await expect(button).toBeEnabled()
  })
})
