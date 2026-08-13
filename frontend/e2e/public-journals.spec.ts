import { expect, test } from '@playwright/test'

test.describe('公开端日记列表 SFC', () => {
  test('搜索和标签筛选保留在 URL 中', async ({ page }) => {
    const journalRequests: URL[] = []
    await page.route('**/api/public/journals**', route => {
      journalRequests.push(new URL(route.request().url()))
      return route.fulfill({
        json: {
          code: 'OK', message: 'success', data: {
            items: [{ id: 1, title: '京都的第三个清晨', slug: 'kyoto-morning', excerpt: null, occurredOn: '2026-04-03', tripTitle: null, tripSlug: null, cityName: '京都', coverUrl: null }],
            page: 1, pageSize: 12, total: 1, totalPages: 1,
          },
        },
      })
    })
    await page.route('**/api/public/tags', route => route.fulfill({
      json: { code: 'OK', message: 'success', data: [{ id: 1, name: '春天', slug: 'spring', journalCount: 2 }] },
    }))

    await page.goto('/#/journals')
    await expect(page.locator('.journal-card h3')).toHaveText('京都的第三个清晨')

    await page.locator('input[type="search"]').fill('京都')
    await page.locator('.search-box button').click()
    await expect(page).toHaveURL(/#\/journals\?q=%E4%BA%AC%E9%83%BD/)

    await page.locator('.tag-chip').click()
    await expect(page).toHaveURL(/tag=spring/)
    await expect.poll(() => journalRequests.at(-1)?.searchParams.get('keyword')).toBe('京都')
    await expect.poll(() => journalRequests.at(-1)?.searchParams.get('tag')).toBe('spring')

    await page.locator('.tag-chip').click()
    await expect(page).not.toHaveURL(/tag=spring/)
  })

  test('窄屏空状态可清空筛选', async ({ page }) => {
    await page.route('**/api/public/journals**', route => route.fulfill({
      json: { code: 'OK', message: 'success', data: { items: [], page: 1, pageSize: 12, total: 0, totalPages: 0 } },
    }))
    await page.route('**/api/public/tags', route => route.fulfill({
      json: { code: 'OK', message: 'success', data: [] },
    }))

    await page.goto('/#/journals?q=none')
    await expect(page.locator('.empty')).toContainText('没有找到匹配的日记')
    await page.locator('.text-link-btn').click()
    await expect(page).toHaveURL(/#\/journals$/)
  })
})
