import { expect, test } from '@playwright/test'

function review(year: number) {
  return {
    year,
    tripCount: year === 2026 ? 2 : 1,
    cityCount: 5,
    countryCount: 2,
    journalCount: 7,
    photoCount: 128,
    distanceKm: 12345,
    cities: [],
    trips: [{ title: `${year} 京都之旅`, slug: `kyoto-${year}`, startDate: `${year}-04-01`, endDate: `${year}-04-05`, cityCount: 2, journalCount: 3 }],
    farthestCity: '雷克雅未克',
    longestTripDays: 8,
  }
}

test.describe('公开端年度回顾 SFC', () => {
  test('默认跳到最近年份并可切换年份', async ({ page }) => {
    const requestedYears: number[] = []
    await page.route('**/api/public/years', route => route.fulfill({
      json: { code: 'OK', message: 'success', data: [2026, 2025] },
    }))
    await page.route(/\/api\/public\/years\/\d+$/, route => {
      const year = Number(new URL(route.request().url()).pathname.split('/').at(-1))
      requestedYears.push(year)
      return route.fulfill({ json: { code: 'OK', message: 'success', data: review(year) } })
    })

    await page.goto('/#/years')
    await expect(page).toHaveURL(/#\/years\/2026$/)
    await expect(page.locator('.page-title h1')).toHaveText('2026 年回顾')
    await expect(page.locator('.review-stat')).toHaveCount(6)
    await expect(page.locator('.review-trips a')).toHaveAttribute('href', '#/trips/kyoto-2026')

    await page.locator('.year-switch button').filter({ hasText: /^2025$/ }).click()
    await expect(page).toHaveURL(/#\/years\/2025$/)
    await expect(page.locator('.page-title h1')).toHaveText('2025 年回顾')
    await expect.poll(() => requestedYears.at(-1)).toBe(2025)
  })

  test('无内容年份显示空状态', async ({ page }) => {
    await page.route('**/api/public/years', route => route.fulfill({
      json: { code: 'OK', message: 'success', data: [2024] },
    }))
    await page.route('**/api/public/years/2024', route => route.fulfill({
      json: { code: 'OK', message: 'success', data: review(2024) },
    }))

    await page.goto('/#/years/2024')
    // journalCount=0 才走空状态，这里用页面内拦截替换响应。
    await page.unroute('**/api/public/years/2024')
    await page.route('**/api/public/years/2024', route => route.fulfill({
      json: { code: 'OK', message: 'success', data: { ...review(2024), journalCount: 0 } },
    }))
    await page.reload()
    await expect(page.locator('.empty')).toHaveText('2024 年还没有公开的日记。')
  })
})
