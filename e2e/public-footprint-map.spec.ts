import { expect, test } from '@playwright/test'

const markers = [
  { cityName: '京都', regionName: null, countryName: '日本', adcode: null, coordinateSystem: 'WGS84', latitude: 35.0116, longitude: 135.7681, firstVisitedOn: '2026-04-01', visitedYears: [2026], tripCount: 1, publishedJournalCount: 2, trips: [{ title: '关西春日', slug: 'kansai' }], journals: [] },
  { cityName: '东京', regionName: null, countryName: '日本', adcode: null, coordinateSystem: 'WGS84', latitude: 35.6762, longitude: 139.6503, firstVisitedOn: null, visitedYears: [2024], tripCount: 1, publishedJournalCount: 0, trips: [{ title: '东京周末', slug: 'tokyo' }], journals: [] },
  { cityName: '巴黎', regionName: null, countryName: '法国', adcode: null, coordinateSystem: 'WGS84', latitude: 48.8566, longitude: 2.3522, firstVisitedOn: '2025-06-01', visitedYears: [2025], tripCount: 1, publishedJournalCount: 1, trips: [{ title: '法兰西', slug: 'france' }], journals: [] },
]

test.describe('公开端足迹地图 SFC', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('travel-map-provider', 'OSM'))
    await page.route('https://tile.openstreetmap.org/**', route => route.abort())
    await page.route('**/api/public/map/cities', route => route.fulfill({ json: { code: 'OK', message: 'success', data: markers } }))
  })

  test('渲染筛选器、地图标记和足迹卡片', async ({ page }) => {
    await page.goto('/#/map')
    await expect(page.locator('.map-filter-bar select')).toHaveCount(3)
    await expect(page.locator('.city-marker')).toHaveCount(3)
    await expect(page.locator('.journal-card')).toHaveCount(3)
    await expect(page.locator('.map-filter-bar > span')).toHaveText('3 个地点')
  })

  test('组合筛选同步更新地图和空状态', async ({ page }) => {
    await page.goto('/#/map')
    await page.getByLabel('按国家筛选').selectOption('日本')
    await page.getByText('仅看有日记的城市').click()
    await expect(page.locator('.journal-card')).toHaveCount(1)
    await expect(page.locator('.journal-card h3')).toContainText('京都')
    await expect(page.locator('.city-marker')).toHaveCount(1)

    await page.getByLabel('按旅行筛选').selectOption('tokyo')
    await expect(page.locator('.empty')).toHaveText('当前筛选条件下没有足迹。')
    await expect(page.locator('.city-marker')).toHaveCount(0)
  })
})
