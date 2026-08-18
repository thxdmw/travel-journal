import { expect, test } from '@playwright/test'
import { adminRequest, createTestTrip, login, openNewJournal, writeParagraphs, waitSaved } from './helpers'

/*
 * 图片缓存的真实链路。
 *
 * 单元测试里 /api/media/x/display 被 mock 成直接返回图片字节，而线上它是一次 302 跳到
 * MinIO 预签名地址——重定向、跨源、opaque 响应这些只有真浏览器才走得到。这条 spec 补的
 * 就是那一段：Service Worker 装上之后，公开图片能进缓存、草稿图片不进、撤回发布之后
 * 旧缓存不再被拿出来。
 *
 * 需要一个连着真实 PostgreSQL 和 MinIO 的实例。
 */

/** 一张 1x1 的 PNG，内容无所谓，这里只关心它经过哪条缓存路径。 */
const PIXEL = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64')

interface UploadedMedia { id: number }
interface Journal { id: number, slug: string, revision: number }

/**
 * Service Worker 盖在缓存条目上的校验时间戳。
 *
 * 必须和 public/service-worker.js 里的 VALIDATED_AT 完全一致——SW 不是模块，没法 import
 * 常量，只能靠这条注释盯着。名字写错不会报错，只会让「把缓存改旧」这一步悄悄失效，
 * 于是 SW 认为缓存还新鲜、直接返回它，测试看到的是一个和真实行为无关的 200。
 */
const VALIDATED_AT = 'x-sw-validated-at'

/** 等 Service Worker 真正接管当前页面，否则后面的断言测的是「没有 SW」的行为。 */
async function waitForController(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20_000 })
}

/**
 * 补上标题再发布，返回发布后的日记。
 *
 * 草稿和发布是两套校验标准：写的时候标题可以空着，发布要求它非空。补标题这一步本身也会
 * 推进 revision，所以发布要用补完之后的那个版本号，不能拿写正文时那个。
 */
async function publishWithTitle(page: import('@playwright/test').Page, journalId: number, title: string) {
  const draft = await adminRequest<Journal>(page, 'GET', `/journals/${journalId}`)
  const titled = await adminRequest<Journal>(page, 'PATCH', `/journals/${journalId}/draft`,
      { title, expectedRevision: draft.revision })
  return await adminRequest<Journal>(page, 'POST', `/journals/${journalId}/publish`,
      { expectedRevision: titled.revision })
}

/** 这个地址现在在 Cache Storage 里吗。 */
function cached(page: import('@playwright/test').Page, url: string) {
  return page.evaluate(async target => {
    const cache = await caches.open('tj-media-v1')
    return Boolean(await cache.match(target))
  }, url)
}

/*
 * @media 是 CI 的筛选标记。
 *
 * 这两条要真的连着 MinIO 才跑得起来，所以不进 @smoke 那一批，由单独的
 * verify-media-integration 步骤按这个标记挑出来跑。标记删掉的话测试文件还在仓库里，
 * 但 CI 里没有任何一步会执行它——而图片权限缓存恰恰是最近改动最多的一块。
 */
test.describe('图片缓存生命周期 @media', () => {
  test('公开图片进缓存，草稿图片不进，撤回后旧缓存失效', async ({ page, browser }) => {
    await login(page)
    const trip = await createTestTrip(page, 'E2E 图片缓存')
    const journalId = await openNewJournal(page, trip)
    await writeParagraphs(page, ['缓存生命周期测试'])
    await waitSaved(page)

    // 上传一张图片，此时这篇日记还是草稿
    const uploaded = await page.request.fetch(`/api/admin/journals/${journalId}/media`, {
      method: 'POST',
      multipart: { file: { name: 'pixel.png', mimeType: 'image/png', buffer: PIXEL } },
      headers: { 'X-XSRF-TOKEN': decodeURIComponent(
          (await page.context().cookies()).find(item => item.name === 'XSRF-TOKEN')?.value ?? '') },
    })
    expect(uploaded.ok(), `上传失败：${uploaded.status()}`).toBeTruthy()
    const media = ((await uploaded.json()) as { data: UploadedMedia }).data
    const imageUrl = `/api/media/${media.id}/display`

    /*
     * 草稿阶段：作者自己看得见，但这张图不该留在设备上。
     * 后台页面看到的图片一律不进缓存——草稿图和公开图的地址长得一模一样。
     */
    await page.goto('/admin/#/journals/' + journalId)
    await waitForController(page)
    await page.evaluate(url => fetch(url).then(response => response.blob()), imageUrl)
    expect(await cached(page, imageUrl), '草稿图片不应该进入缓存').toBe(false)

    // 发布之后同一张图变成公开内容
    const journal = await publishWithTitle(page, journalId, '缓存生命周期测试')

    /*
     * 从这里开始换成访客。
     *
     * 「撤回之后还能不能拿到」只有对访客才有意义：作者自己撤回后照样看得见，那是他的
     * 草稿。用管理员会话去断言 403 是测错了对象——服务端会正常返回 200，只是响应头
     * 变成 no-store。真正要证明的是另一台没登录的设备拿不到。
     */
    const guest = await browser.newContext()
    try {
      const guestPage = await guest.newPage()
      await guestPage.goto(`/#/journals/${journal.slug}`)
      await waitForController(guestPage)
      await guestPage.evaluate(url => fetch(url).then(response => response.blob()), imageUrl)
      await expect.poll(() => cached(guestPage, imageUrl), { timeout: 10_000 })
          .toBe(true)

      // 作者撤回发布
      const published = await adminRequest<Journal>(page, 'GET', `/journals/${journalId}`)
      await adminRequest(page, 'POST', `/journals/${journalId}/unpublish`,
          { expectedRevision: published.revision })

      /*
       * SW 有 60 秒新鲜期，不能干等——把缓存条目的时间戳改旧，模拟「一分钟之后再来看」。
       * 那时它必须回服务端校验，拿到 403 之后连本地这份一起删掉。
       */
      const staled = await guestPage.evaluate(async ([url, header]) => {
        const cache = await caches.open('tj-media-v1')
        const hit = await cache.match(url)
        if (!hit) return false
        const headers = new Headers(hit.headers)
        headers.set(header, String(Date.now() - 10 * 60 * 1000))
        await cache.put(url, new Response(await hit.blob(), { status: hit.status, headers }))
        // 确认真的写进去了：头名写错的话这里会露馅，而不是让后面的断言去背锅
        const again = await cache.match(url)
        return Number(again?.headers.get(header)) < Date.now() - 60_000
      }, [imageUrl, VALIDATED_AT] as const)
      expect(staled, '没能把缓存条目改成过期，后面的断言不成立').toBe(true)

      const status = await guestPage.evaluate(
          url => fetch(url).then(response => response.status), imageUrl)
      expect(status, '撤回之后访客不该还能拿到这张图').toBeGreaterThanOrEqual(400)
      await expect.poll(() => cached(guestPage, imageUrl), { timeout: 10_000 })
          .toBe(false)
    } finally {
      await guest.close()
    }
  })

  test('离线时已经缓存的公开图片仍然打得开', async ({ page, browser }) => {
    await login(page)
    const trip = await createTestTrip(page, 'E2E 离线图片')
    const journalId = await openNewJournal(page, trip)
    await writeParagraphs(page, ['离线也要看得到照片'])
    await waitSaved(page)

    const uploaded = await page.request.fetch(`/api/admin/journals/${journalId}/media`, {
      method: 'POST',
      multipart: { file: { name: 'pixel.png', mimeType: 'image/png', buffer: PIXEL } },
      headers: { 'X-XSRF-TOKEN': decodeURIComponent(
          (await page.context().cookies()).find(item => item.name === 'XSRF-TOKEN')?.value ?? '') },
    })
    const media = ((await uploaded.json()) as { data: UploadedMedia }).data
    const imageUrl = `/api/media/${media.id}/display`

    const journal = await publishWithTitle(page, journalId, '离线也要看得到照片')

    // 用访客身份看：离线翻看照片的是读者，不是作者
    const guest = await browser.newContext()
    try {
      const guestPage = await guest.newPage()
      await guestPage.goto(`/#/journals/${journal.slug}`)
      await waitForController(guestPage)
      await guestPage.evaluate(url => fetch(url).then(response => response.blob()), imageUrl)
      await expect.poll(() => cached(guestPage, imageUrl), { timeout: 10_000 }).toBe(true)

      // 断网：旅途中翻看已经下载过的照片是主要场景
      await guest.setOffline(true)
      const offlineStatus = await guestPage.evaluate(
          url => fetch(url).then(response => response.status).catch(() => 0), imageUrl)
      expect(offlineStatus, '离线时应该由缓存兜住').toBe(200)
    } finally {
      await guest.close()
    }
  })
})
