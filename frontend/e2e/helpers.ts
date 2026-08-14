import { expect, type Page } from '@playwright/test'
import type { ApiResponse, PageResponse } from '../src/types/common'
import type { Trip, TripRequest } from '../src/types/trip'

export const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin'
export const ADMIN_PASS = process.env.E2E_ADMIN_PASS || ''

type AdminMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const response = await page.request.get('/api/public/csrf')
  expect(response.ok(), `获取 CSRF 令牌返回 ${response.status()}`).toBeTruthy()

  const cookie = (await page.context().cookies()).find(item => item.name === 'XSRF-TOKEN')
  if (!cookie) throw new Error('获取 CSRF 令牌后仍未收到 XSRF-TOKEN Cookie')

  return { 'X-XSRF-TOKEN': decodeURIComponent(cookie.value) }
}

/**
 * 使用当前浏览器登录会话直接调用后台接口。
 *
 * 前端已经迁移为 ESM，不再暴露 window.TravelApi；E2E 准备和核验数据时统一走真实 HTTP API。
 */
export async function adminRequest<T>(
    page: Page,
    method: AdminMethod,
    path: string,
    body?: unknown,
): Promise<T> {
  const write = method !== 'GET'
  const response = await page.request.fetch(`/api/admin${path}`, {
    method,
    ...(body === undefined ? {} : { data: body }),
    ...(write ? { headers: await csrfHeaders(page) } : {}),
  })
  const text = await response.text()

  let payload: ApiResponse<T>
  try {
    payload = JSON.parse(text) as ApiResponse<T>
  } catch {
    throw new Error(
        `${method} ${path} 返回了非 JSON 响应（${response.status()}）：${text.slice(0, 300)}`,
    )
  }

  expect(
      response.ok(),
      `${method} ${path} 返回 ${response.status()}：${payload.message || text}`,
  ).toBeTruthy()
  return payload.data
}

/** 登录后台。后台是 hash 路由的单页应用，登录成功会跳到 #/ 。 */
export async function login(page: Page) {
  // 直接打开登录路由，避免 #/ 在异步会话检查完成前被误判成“已经登录”。
  await page.goto('/admin/#/login')
  const button = page.getByRole('button', { name: '登录', exact: true })
  await expect(button).toBeVisible({ timeout: 15_000 })
  await page.getByPlaceholder(/用户名/).fill(ADMIN_USER)
  await page.getByPlaceholder(/密码/).fill(ADMIN_PASS)

  const responsePromise = page.waitForResponse(
      response =>
          response.request().method() === 'POST' &&
          response.url().endsWith('/api/admin/auth/login'),
  )

  await button.click()
  const response = await responsePromise
  expect(response.ok(), `登录接口返回 ${response.status()}`).toBeTruthy()

  await expect
      .poll(async () => (await page.request.get('/api/admin/auth/session')).status(), {
        timeout: 15_000,
        message: '登录后会话应当可用',
      })
      .toBe(200)

  await expect(page).not.toHaveURL(/#\/login/, { timeout: 15_000 })
  await expect(page.locator('.admin-shell')).toBeVisible({ timeout: 15_000 })
}

/** 为全新 CI 数据库准备一次旅行；已有数据时直接复用第一条。 */
export async function ensureTrip(page: Page) {
  const existing = await adminRequest<PageResponse<Trip>>(
      page,
      'GET',
      '/trips?page=1&pageSize=1',
  )

  const first = existing.items[0]
  if (first) return Number(first.id)

  const stamp = Date.now()
  const body: TripRequest = {
    title: 'E2E 移动端旅程',
    slug: `e2e-mobile-${stamp}`,
    summary: '自动化测试专用',
    status: 'ONGOING',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    defaultCurrency: 'CNY',
    coverMediaId: null,
    internalNote: '可清理',
    themeKey: null,
  }

  const trip = await adminRequest<Trip>(page, 'POST', '/trips', body)
  return Number(trip.id)
}

/** 创建一条隔离旅行，适合会生成 Moment / 日记等关联数据的测试。 */
export async function createTestTrip(page: Page, name = 'E2E 随手记旅程') {
  const body: TripRequest = {
    title: name,
    slug: `e2e-smoke-${Date.now()}`,
    summary: '自动化测试专用',
    status: 'ONGOING',
    startDate: '2099-01-01',
    endDate: '2099-01-31',
    defaultCurrency: 'CNY',
    coverMediaId: null,
    internalNote: '可清理',
    themeKey: null,
  }

  const trip = await adminRequest<Trip>(page, 'POST', '/trips', body)
  return Number(trip.id)
}

/**
 * 等编辑器真正可用。
 *
 * `.editor-page` 是根节点，组件一挂载就可见，那时 `load()` 还在跑、v-loading 的遮罩
 * 还盖在上面。以前靠 `waitForURL` 等 `router.replace` 顺带等到了加载结束，改成直接
 * 进真实 id 之后就没有那个信号了，必须显式等遮罩退场。
 */
async function waitEditorReady(page: Page) {
  await expect(page.locator('.editor-page')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.editor-page .el-loading-mask')).toHaveCount(0, { timeout: 20_000 })
}

/**
 * 打开一篇已经存在的空草稿。
 *
 * 编辑器不再一进 `/journals/new` 就开草稿——那样点一次「写日记」就多一条空记录。
 * 大部分用例关心的是「编辑器打开之后的行为」，所以这里先用真实接口建一篇再直接进去。
 * 「首次编辑才创建」这条路径本身由 journal-draft-creation.spec.ts 覆盖。
 */
export async function openNewJournal(page: Page, tripId?: number) {
  const draft = await adminRequest<{ id: number }>(page, 'POST', '/journals/draft',
      tripId ? { tripId } : {})
  const id = Number(draft.id)
  await page.goto(`/admin/#/journals/${id}`)
  await waitEditorReady(page)
  return id
}

/** 打开空白的新建页面，不预先创建任何草稿。 */
export async function openBlankJournalPage(page: Page, tripId?: number) {
  await page.goto(`/admin/#/journals/new${tripId ? `?tripId=${tripId}` : ''}`)
  await waitEditorReady(page)
}

/** 当前正文里的所有 inline 段落文本。 */
export async function paragraphs(page: Page) {
  return page
      .locator('[data-inline-input]')
      .evaluateAll(nodes => nodes.map(n => (n as HTMLTextAreaElement).value))
}

/** 往正文里连续写几个正文组件；回车现在留给组件内部换行。 */
export async function writeParagraphs(page: Page, texts: string[]) {
  const ghost = page.locator('.block-inline--ghost textarea')
  const first = texts[0]

  if ((await ghost.count()) && first !== undefined) {
    await ghost.click()
    await ghost.fill(first)
    texts = texts.slice(1)
  }

  for (const text of texts) {
    const last = page.locator('[data-inline-input]').last()
    await last.click()
    await last
        .locator('xpath=..')
        .getByRole('button', { name: '新增正文组件' })
        .click()
    await page.locator('[data-inline-input]').last().fill(text)
  }
}

/** 等自动保存落地（顶部状态回到「已保存」）。 */
export async function waitSaved(page: Page) {
  await expect(page.locator('.editor-save-state')).toHaveText(/已保存/, {
    timeout: 20_000,
  })
}

export const isMobile = (page: Page) =>
    (page.viewportSize()?.width ?? 0) <= 780