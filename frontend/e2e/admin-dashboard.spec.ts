import { expect, test } from '@playwright/test'

/*
 * 首页统计现在由后端一个聚合接口回答，不再靠前端把前 100 条日记 filter 一遍——
 * 那样第 101 篇开始数字就是错的。
 */
const overview = {
  trips: 3,
  drafts: 128,
  published: 431,
  themeName: '盛夏出逃',
  recent: [
    { id: 1, title: '京都清晨', tripTitle: '京都四日', occurredOn: '2026-08-01', status: 'DRAFT', updatedAt: '2026-08-02T10:00:00+08:00' },
    { id: 2, title: '青城山', tripTitle: null, occurredOn: '2026-08-02', status: 'PUBLISHED', updatedAt: '2026-08-02T10:00:00+08:00' },
  ],
}

test.describe('后台管理首页 SFC', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      let data: unknown = null
      if (path === '/api/admin/auth/session') data = { id: 1, username: 'admin', displayName: '测试站长', avatarUrl: null, themeKey: null }
      else if (path === '/api/public/profile') data = { displayName: '测试站长', avatarUrl: null, themeKey: null, theme: null }
      else if (path === '/api/public/csrf') data = { token: 'test' }
      else if (path === '/api/admin/dashboard') data = overview
      await route.fulfill({ json: { code: 'OK', message: 'success', data } })
    })
  })

  test('加载统计和最近编辑，并保留后台应用壳', async ({ page }) => {
    await page.goto('/admin/#/')
    await expect(page.locator('.admin-topbar h1')).toHaveText('管理首页')
    await expect(page.locator('.dashboard-grid .metric strong')).toHaveText(['3', '128', '431', '盛夏出逃'])
    await expect(page.locator('.el-table')).toContainText('京都清晨')
    await expect(page.locator('.el-table')).toContainText('青城山')
    // 关联旅行直接显示标题，没有旅行的降级成「独立日记」
    await expect(page.locator('.el-table')).toContainText('京都四日')
    await expect(page.locator('.el-table')).toContainText('独立日记')
    await expect(page.locator('.admin-sidebar')).toBeVisible()
  })

  test('管理旅行按钮进入既有旅行管理路由', async ({ page }) => {
    await page.goto('/admin/#/')
    await page.getByRole('button', { name: '管理旅行' }).click()
    await expect(page).toHaveURL(/#\/trips$/)
    await expect(page.locator('.admin-topbar h1')).toHaveText('旅行管理')
  })
})
