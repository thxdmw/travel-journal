import { expect, test } from '@playwright/test'

const detail = {
  trip: { id: 1, title: '京都之旅', slug: 'kyoto', summary: '沿着鸭川慢慢走', status: 'COMPLETED', startDate: '2026-04-01', endDate: '2026-04-05', cities: ['京都', '宇治'], journalCount: 1, coverUrl: null },
  stops: [
    { cityName: '京都', regionName: null, countryName: '日本', latitude: 35.0116, longitude: 135.7681, formattedAddress: null, adcode: null, coordinateSystem: 'WGS84', arrivalDate: '2026-04-01', departureDate: '2026-04-03', sortOrder: 1 },
    { cityName: '宇治', regionName: null, countryName: '日本', latitude: 34.8845, longitude: 135.7997, formattedAddress: null, adcode: null, coordinateSystem: 'WGS84', arrivalDate: '2026-04-04', departureDate: '2026-04-05', sortOrder: 2 },
  ],
  journals: [{ id: 2, title: '京都的第三个清晨', slug: 'morning', excerpt: '鸭川边的风', occurredOn: '2026-04-03', tripTitle: '京都之旅', tripSlug: 'kyoto', cityName: '京都', coverUrl: null }],
  theme: null,
}

test.describe('公开端旅行详情 SFC', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('travel-map-provider', 'OSM'))
    await page.route('https://tile.openstreetmap.org/**', route => route.abort())
    await page.route('**/api/public/trips/kyoto', route => route.fulfill({ json: { code: 'OK', message: 'success', data: detail } }))
  })

  test('渲染旅行时间线与两点路线', async ({ page }) => {
    await page.goto('/#/trips/kyoto')

    await expect(page.locator('.trip-banner h1')).toHaveText('京都之旅')
    await expect(page.locator('.timeline-item')).toHaveCount(1)
    await expect(page.locator('.timeline-item')).toHaveAttribute('href', '#/journals/morning')
    await expect(page.locator('.route-marker')).toHaveCount(2)
    await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1)
  })

  test('离开详情后地图容器与主题作用域被清理', async ({ page }) => {
    await page.goto('/#/trips/kyoto')
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await page.locator('.trip-banner + .map-stats .map-box').evaluate(element => { element.id = 'trip-map-before-leave' })

    await page.locator('.brand').click()
    await expect(page).toHaveURL(/#\/$/)
    await expect(page.locator('.trip-banner')).toHaveCount(0)
    await expect(page.locator('#trip-map-before-leave')).toHaveCount(0)
  })
})
