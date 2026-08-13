import { expect, test } from '@playwright/test'

const trip = { id: 3, createdAt: '2026-10-01T00:00:00+08:00', updatedAt: '2026-10-01T00:00:00+08:00', title: '川西秋日', slug: 'west-sichuan', summary: null, status: 'ONGOING', startDate: '2026-10-01', endDate: '2026-10-07', defaultCurrency: 'CNY', coverMediaId: null, internalNote: null, themeKey: null }
let moment = { id: 9, clientId: null, tripId: 3, tripStopId: null, cityName: null, occurredAt: '2026-10-02T08:30:00+08:00', day: '2026-10-02', occurredZoneId: 'Asia/Shanghai', utcOffsetMinutes: 480, content: '山谷里起雾了', placeName: '折多山', latitude: null, longitude: null, mood: '安静', journalEntryId: null, sorted: false, photos: [] }

test.describe('后台随手记 SFC', () => {
  test.beforeEach(async ({ page }) => {
    moment = { ...moment, content: '山谷里起雾了' }
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname
      let data: unknown = null
      if (path === '/api/admin/auth/session') data = { id: 1, username: 'admin', displayName: '测试站长', avatarUrl: null, themeKey: null }
      else if (path === '/api/public/profile') data = { displayName: '测试站长', avatarUrl: null, themeKey: null, theme: null }
      else if (path === '/api/public/csrf') data = { token: 'test' }
      else if (path === '/api/admin/trips') data = { items: [trip], page: 1, pageSize: 100, total: 1, totalPages: 1 }
      else if (path === '/api/admin/moments/ai-status') data = { available: false }
      else if (path === '/api/admin/moments/compose') data = { journalId: 88, momentCount: 1, photoCount: 0, created: true, polished: false }
      else if (path === '/api/admin/moments/9' && request.method() === 'PUT') {
        const body = request.postDataJSON() as { content: string }
        moment = { ...moment, content: body.content }
        data = moment
      } else if (path === '/api/admin/moments') data = [moment]
      await route.fulfill({ json: { code: 'OK', message: 'success', data } })
    })
  })

  test('加载时间线并修改随手记', async ({ page }) => {
    await page.goto('/admin/#/moments')
    await expect(page.locator('.admin-topbar h1')).toHaveText('随手记')
    await expect(page.locator('.moment-item')).toContainText('山谷里起雾了')
    await page.locator('.moment-item').getByRole('button', { name: '修改' }).click()
    await page.locator('.moment-body textarea').fill('雾散了一点')
    await page.locator('.moment-edit-actions').getByRole('button', { name: '保存' }).click()
    await expect(page.locator('.moment-item')).toContainText('雾散了一点')
    await expect(page.getByText('已修改')).toBeVisible()
  })

  test('整理当天记录后进入目标日记', async ({ page }) => {
    await page.goto('/admin/#/moments')
    await page.getByRole('button', { name: '整理成日记' }).click()
    await expect(page).toHaveURL(/#\/journals\/88$/)
  })
})
