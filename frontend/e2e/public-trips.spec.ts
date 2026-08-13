import { expect, test } from '@playwright/test'

const trips = [
  { id: 1, title: '京都之旅', slug: 'kyoto', summary: null, status: 'COMPLETED', startDate: '2026-04-01', endDate: '2026-04-05', cities: ['京都'], journalCount: 3, coverUrl: null },
  { id: 2, title: '冰岛环岛', slug: 'iceland', summary: '追着极光走', status: 'COMPLETED', startDate: '2025-10-01', endDate: '2025-10-08', cities: ['雷克雅未克'], journalCount: 5, coverUrl: null },
]

test.describe('公开端旅行列表 SFC', () => {
  test('在桌面与移动端加载、筛选并保留路由链接', async ({ page }) => {
    await page.route('**/api/public/trips', route => route.fulfill({
      json: { code: 'OK', message: 'success', data: trips },
    }))

    await page.goto('/#/trips')

    await expect(page.locator('.page-title h1')).toHaveText('旅行')
    await expect(page.locator('.journal-card')).toHaveCount(2)
    await page.locator('.filter-row .chip').filter({ hasText: /^2025$/ }).click()
    await expect(page.locator('.journal-card')).toHaveCount(1)
    await expect(page.locator('.journal-card h3')).toHaveText('冰岛环岛')
    await expect(page.locator('.journal-card')).toHaveAttribute('href', '#/trips/iceland')
  })

  test('无数据时显示空状态', async ({ page }) => {
    await page.route('**/api/public/trips', route => route.fulfill({
      json: { code: 'OK', message: 'success', data: [] },
    }))

    await page.goto('/#/trips')

    await expect(page.locator('.empty')).toHaveText('还没有公开的旅行。')
  })
})
