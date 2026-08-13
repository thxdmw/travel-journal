import { expect, test } from '@playwright/test'

test.describe('主题卡片微缩布局', () => {
  test('在后台卡片尺寸内完整展示日记结构', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 390 })
    await page.goto('/theme-card-preview.html')

    await expect(page.locator('.journal-block')).toHaveCount(5)
    await expect(page.locator('.journal-day-summary')).toBeVisible()

    const layout = await page.evaluate(() => {
      const photo = document.querySelector<HTMLElement>('.mini-photo')
      const journalDocument = document.querySelector<HTMLElement>('.journal-document')
      const summary = window.document.querySelector<HTMLElement>('.journal-day-summary')
      return {
        photoHeight: photo?.getBoundingClientRect().height ?? Infinity,
        documentDisplay: journalDocument ? getComputedStyle(journalDocument).display : '',
        summaryBottom: summary?.getBoundingClientRect().bottom ?? Infinity,
        viewportHeight: innerHeight,
      }
    })

    expect(layout.documentDisplay).toBe('grid')
    expect(layout.photoHeight).toBeLessThan(130)
    expect(layout.summaryBottom).toBeLessThanOrEqual(layout.viewportHeight)
  })
})
