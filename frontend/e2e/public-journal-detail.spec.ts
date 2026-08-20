import { expect, test } from '@playwright/test'

const detail = {
  journal: { id: 1, title: '京都的第三个清晨', slug: 'e2e-journal', excerpt: '清晨散步', occurredOn: '2026-04-03', tripTitle: '关西春日', tripSlug: 'kansai', cityName: '京都', coverUrl: null },
  contentJson: { schemaVersion: 1, blocks: [
    { id: 'paragraph', type: 'paragraph', version: 1, title: '', data: { text: '沿着鸭川慢慢走。' }, settings: {} },
    { id: 'image', type: 'image', version: 1, title: '', data: { previewUrl: '/img/home-hero-kyoto-960.webp', caption: '鸭川清晨' }, settings: {} },
  ] },
  media: [], previousSlug: 'previous', nextSlug: 'next', theme: null,
  route: [{ order: 1, time: '07:30', title: '鸭川', note: '散步', latitude: 35.02, longitude: 135.77, coordinateSystem: 'WGS84', photos: [], source: 'moment' }],
}

test.describe('公开端日记详情 SFC', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('travel-map-provider', 'OSM'))
    await page.route('https://tile.openstreetmap.org/**', route => route.abort())
    await page.route('**/api/public/journals/e2e-journal', route => route.fulfill({ json: { code: 'OK', message: 'success', data: detail } }))
  })

  test('渲染 Blocks 正文、路线、灯箱和阅读字号', async ({ page }) => {
    await page.goto('/#/journals/e2e-journal')
    await expect(page.locator('.article-head h1')).toHaveText('京都的第三个清晨')
    await expect(page.locator('.journal-document')).toContainText('沿着鸭川慢慢走')
    await expect(page.locator('.day-route-list li')).toHaveCount(1)
    await expect(page.locator('.route-marker')).toHaveCount(1)

    await page.locator('.journal-figure img').click({ force: true })
    await expect(page.locator('.photo-lightbox')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.photo-lightbox')).toHaveCount(0)

    await page.getByLabel('增大正文字号').click()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('travel-journal.reading-scale'))).toBe('2')
  })

  test('草稿预览失败时显示明确过期状态', async ({ page }) => {
    await page.route('**/api/public/preview/expired-token', route => route.fulfill({ status: 404, json: { code: 'NOT_FOUND', message: 'expired', data: null } }))
    await page.goto('/#/preview/expired-token')
    await expect(page.locator('.loading')).toHaveText('预览链接无效或已过期。')
  })
})
