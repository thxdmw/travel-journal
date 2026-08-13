import { expect, test } from '@playwright/test'

test.describe('后台个人资料 SFC', () => {
  test.beforeEach(async ({ page }) => {
    let user = { id: 1, username: 'admin', displayName: '测试站长', avatarUrl: null, themeKey: null }
    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      let data: unknown = null
      if (path === '/api/admin/auth/session') data = user
      else if (path === '/api/public/profile') data = { displayName: user.displayName, avatarUrl: user.avatarUrl, themeKey: null, theme: null }
      else if (path === '/api/public/csrf') data = { token: 'test' }
      else if (path === '/api/admin/profile/display-name') {
        const body = request.postDataJSON() as { displayName: string }
        user = { ...user, displayName: body.displayName }
        data = { displayName: user.displayName, avatarUrl: null, themeKey: null, themeMode: 'FIXED' }
      }
      await route.fulfill({ json: { code: 'OK', message: 'success', data } })
    })
  })

  test('修改昵称后页面与后台应用壳同步更新', async ({ page }) => {
    await page.goto('/admin/#/profile')
    await expect(page.locator('.admin-topbar h1')).toHaveText('个人资料')
    await page.getByRole('button', { name: '改昵称' }).click()
    await page.getByPlaceholder('前台展示的昵称').fill('新站长')
    await page.locator('.profile-name-edit').getByRole('button', { name: '保存' }).click()
    await expect(page.locator('.profile-name-view strong')).toHaveText('新站长')
    await expect(page.locator('.admin-sidebar')).toContainText('新站长')
    await expect(page.getByText('昵称已更新')).toBeVisible()
  })

  test('密码不合规时不发送请求并显示统一错误', async ({ page }) => {
    let passwordCalls = 0
    await page.route('**/api/admin/auth/change-password', async route => {
      passwordCalls += 1
      await route.fulfill({ json: { code: 'OK', message: 'success', data: null } })
    })
    await page.goto('/admin/#/profile')
    const inputs = page.locator('.password-card input')
    await inputs.nth(1).fill('short')
    await page.locator('.password-card').getByRole('button', { name: '确认修改' }).click()
    await expect(page.getByText('新密码至少需要 8 位')).toBeVisible()
    expect(passwordCalls).toBe(0)
  })
})
