import { test, expect } from '@playwright/test'
import type { PageResponse } from '../src/types/common'
import type { JournalEntry } from '../src/types/journal'
import {
  adminRequest,
  ensureTrip,
  login,
  openBlankJournalPage,
  waitSaved,
  writeParagraphs,
} from './helpers'

/*
 * 「点一次写日记就多一条空草稿」的端到端回归。
 *
 * 以前编辑器一进 /journals/new 就 POST 一篇草稿，于是点开看一眼再退出也会在库里
 * 留下一条空记录。现在延迟到第一次有效编辑，这里从浏览器这一端确认这件事。
 */

test.beforeEach(async ({ page }) => {
  await login(page)
})

/** 当前草稿总数，用来判断这一步有没有偷偷新建。 */
async function draftCount(page: import('@playwright/test').Page) {
  const result = await adminRequest<PageResponse<JournalEntry>>(
      page, 'GET', '/journals?page=1&pageSize=1&status=DRAFT')
  return result.total
}

test('@smoke 打开新建页面又离开，不产生任何草稿', async ({ page }) => {
  const before = await draftCount(page)

  await openBlankJournalPage(page)
  // 停一会儿，让可能存在的自动保存有机会发出去
  await page.waitForTimeout(2000)
  await page.goto('/admin/#/trips')
  await page.waitForTimeout(1000)

  expect(await draftCount(page), '看一眼就走不该留下草稿').toBe(before)
})

test('第一次写正文才创建草稿，而且只创建一篇', async ({ page }) => {
  const before = await draftCount(page)

  await openBlankJournalPage(page)
  await writeParagraphs(page, ['第一次落笔就该有一篇草稿了', '第二段不该再开一篇'])

  // 草稿一建出来，地址栏上的 new 会换成真实 id
  await page.waitForURL(/#\/journals\/\d+/, { timeout: 20_000 })
  await waitSaved(page)

  expect(await draftCount(page), '连写两段也只该有一篇').toBe(before + 1)

  const id = Number(page.url().match(/#\/journals\/(\d+)/)![1])
  const entry = await adminRequest<JournalEntry>(page, 'GET', `/journals/${id}`)
  expect(JSON.stringify(entry.contentJson)).toContain('第一次落笔就该有一篇草稿了')
})

test('从旅行工作台进入时，首次编辑创建的草稿带着旅行', async ({ page }) => {
  const tripId = await ensureTrip(page)

  await openBlankJournalPage(page, tripId)
  await writeParagraphs(page, ['这一篇属于这次旅行'])
  await page.waitForURL(/#\/journals\/\d+/, { timeout: 20_000 })
  await waitSaved(page)

  const id = Number(page.url().match(/#\/journals\/(\d+)/)![1])
  const entry = await adminRequest<JournalEntry>(page, 'GET', `/journals/${id}`)
  expect(entry.tripId).toBe(tripId)
})

test('从已有日记切到写日记，不会带着上一篇，也不建草稿', async ({ page }) => {
  const draft = await adminRequest<JournalEntry>(page, 'POST', '/journals/draft', {})
  await adminRequest<JournalEntry>(page, 'PATCH', `/journals/${draft.id}/draft`,
      { title: '上一篇的标题' })

  await page.goto(`/admin/#/journals/${draft.id}`)
  await expect(page.locator('.editor-page')).toBeVisible({ timeout: 20_000 })
  const before = await draftCount(page)

  // 侧边栏「写日记」和编辑器共用同一条路由，组件会被复用
  await page.goto('/admin/#/journals/new')
  await page.waitForTimeout(1500)

  expect(page.url()).toContain('#/journals/new')
  expect(await draftCount(page), '切到新建页不该建草稿').toBe(before)
})
