import { expect, test } from '@playwright/test'

const journals = Array.from({ length: 4 }, (_, index) => ({
  id: index + 1, title: `日记 ${index + 1}`, slug: `journal-${index + 1}`, excerpt: null,
  occurredOn: '2026-04-03', tripTitle: null, tripSlug: null, cityName: '京都', coverUrl: null,
}))

function home(recentJournals = journals) {
  return {
    recentJournals, recentTrips: [],
    cityMarkers: [{ cityName: '京都', regionName: null, countryName: '日本', adcode: null, coordinateSystem: 'WGS84', latitude: 35.0116, longitude: 135.7681, firstVisitedOn: '2026-04-01', visitedYears: [2026], tripCount: 1, publishedJournalCount: 4, trips: [], journals: [] }],
    tripCount: 2, cityCount: 5, journalCount: 4, photoCount: 128,
  }
}

test.describe('公开端首页 SFC', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('travel-map-provider', 'OSM'))
    await page.route('https://tile.openstreetmap.org/**', route => route.abort())
  })

  test('渲染 Hero、最近日记、足迹和统计', async ({ page }) => {
    await page.route('**/api/public/home', route => route.fulfill({ json: { code: 'OK', message: 'success', data: home() } }))
    await page.goto('/#/')

    await expect(page.locator('.hero-copy h1')).toContainText('把走过的路')
    await expect(page.locator('.card-grid .journal-card')).toHaveCount(3)
    await expect(page.locator('.city-marker')).toHaveCount(1)
    await expect(page.locator('.stats-grid .stat strong')).toHaveText(['2', '4', '5', '128'])
  })

  test('无日记时显示明确空状态', async ({ page }) => {
    await page.route('**/api/public/home', route => route.fulfill({ json: { code: 'OK', message: 'success', data: home([]) } }))
    await page.goto('/#/')
    await expect(page.locator('.home-page .empty')).toHaveText('第一篇旅行日记，正在等待被写下。')
  })
})
