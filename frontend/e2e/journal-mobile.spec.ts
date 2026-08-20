import { test, expect } from '@playwright/test'
import type { JournalEntry } from '../src/types/journal'
import {
  adminRequest,
  login,
  ensureTrip,
  openNewJournal,
  paragraphs,
  writeParagraphs,
  waitSaved,
  isMobile,
} from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('@smoke 不建旅行也能直接打开独立日记草稿', async ({ page }) => {
  const id = await openNewJournal(page)
  expect(id).toBeGreaterThan(0)

  // 打开一篇还没写东西的草稿不会触发保存，顶栏就显示状态本身
  await expect(page.locator('.editor-save-state')).toHaveText(/草稿/)

  const entry = await adminRequest<JournalEntry>(
      page,
      'GET',
      `/journals/${id}`,
  )

  // 全局 JSON 策略会省略 null 字段；null 和 undefined 在这里都表示未归入旅行。
  expect(entry.tripId ?? null).toBeNull()
  await expect(page.locator('.editor-context')).toContainText('未归入旅行')

  if (isMobile(page)) {
    await page.locator('.editor-more').click()
  }

  const tripSelect = page
      .locator('.editor-meta')
      .first()
      .locator('.el-select')
      .first()

  await expect(tripSelect).toBeVisible()
  await expect(tripSelect).toContainText('所属旅行（可选）')
})

test('从旅行工作台进入仍会自动带上旅行', async ({ page }) => {
  const tripId = await ensureTrip(page)
  const id = await openNewJournal(page, tripId)

  const entry = await adminRequest<JournalEntry>(
      page,
      'GET',
      `/journals/${id}`,
  )

  expect(entry.tripId).toBe(tripId)
})

test('连续写三段，全程不弹任何窗', async ({ page }) => {
  await openNewJournal(page)

  const dialogs: string[] = []
  page.on('dialog', dialog => {
    dialogs.push(dialog.message())
    void dialog.dismiss()
  })

  await writeParagraphs(page, [
    '今天从京都站出来的时候下着一点雨。',
    '走到鸭川的时候突然放晴了。',
    '后来去了筑地市场，海胆比想象中甜。',
  ])

  expect(await paragraphs(page)).toEqual([
    '今天从京都站出来的时候下着一点雨。',
    '走到鸭川的时候突然放晴了。',
    '后来去了筑地市场，海胆比想象中甜。',
  ])

  expect(dialogs).toHaveLength(0)
  await expect(page.locator('.block-config-dialog')).toHaveCount(0)
})

test(
    '@smoke 回车在正文组件内换行，新增正文按钮才会拆出新组件',
    async ({ page }) => {
      await openNewJournal(page)
      await writeParagraphs(page, ['第一行'])

      const first = page.locator('[data-inline-input]').first()
      await first.press('End')
      await first.press('Enter')
      await first.type('第二行')

      await expect
          .poll(() => paragraphs(page))
          .toEqual(['第一行\n第二行'])

      await first
          .locator('xpath=..')
          .getByRole('button', { name: '新增正文组件' })
          .click()

      await expect
          .poll(() => paragraphs(page))
          .toEqual(['第一行\n第二行', ''])

      await waitSaved(page)
    },
)

test('段首退格与上一段合并', async ({ page }) => {
  await openNewJournal(page)
  await writeParagraphs(page, ['第一段。', '第二段。'])

  const second = page.locator('[data-inline-input]').last()
  await second.click()
  await second.press('Home')
  await second.press('Backspace')

  await expect
      .poll(() => paragraphs(page))
      .toEqual(['第一段。第二段。'])
})

test('不填标题也能存，刷新后内容还在', async ({ page }) => {
  const id = await openNewJournal(page)
  await writeParagraphs(page, ['测试自动保存的这一段。'])
  await waitSaved(page)

  await page.reload()
  await page.waitForURL(new RegExp(`#/journals/${id}`))

  await expect
      .poll(() => paragraphs(page), { timeout: 20_000 })
      .toEqual(['测试自动保存的这一段。'])
})

test('发布前会拦下空标题', async ({ page }) => {
  await openNewJournal(page)
  await writeParagraphs(page, ['正文有内容，但标题是空的。'])
  await waitSaved(page)

  if (isMobile(page)) {
    await page.locator('.editor-more').click()
  }

  await page.getByRole('button', { name: '发布日记' }).click()

  // 前端表单校验会指出必填项，后端也会再拦一道；无论哪层，状态都不该变成已发布
  await expect(page.locator('.el-form-item__error').first()).toBeVisible()
  await expect(
      page.getByRole('button', { name: '更新发布' }),
  ).toHaveCount(0)
})

test('填好标题后可以发布', async ({ page }) => {
  await openNewJournal(page)
  await writeParagraphs(page, ['这一篇会被发布出去。'])

  if (isMobile(page)) {
    await page.locator('.editor-more').click()
  }

  await page
      .getByPlaceholder(/日记标题/)
      .fill('E2E · ' + Date.now())

  await waitSaved(page)
  await page.getByRole('button', { name: '发布日记' }).click()

  await expect(
      page.getByRole('button', { name: '更新发布' }),
  ).toBeVisible({ timeout: 20_000 })
})

/*
 * 退出编辑器时刻意「不」删空草稿。
 *
 * 那一刻最后一次自动保存可能还在路上，服务端看到的空正文并不代表作者什么都没写——
 * 删错一篇正文的代价远高于库里多留一天的空记录。真正没人动过的空草稿由服务端的
 * EmptyDraftCleaner 满 24 小时后回收，那条路径不适合端到端测试，由单元测试覆盖。
 */
test(
    '什么都不写就退出，草稿仍然留着（回收交给服务端定时任务）',
    async ({ page }) => {
      const id = await openNewJournal(page)

      await page.goto('/admin/#/trips')
      await page.waitForTimeout(1500)

      const response = await page.request.get(`/api/admin/journals/${id}`)
      expect(response.status(), '退出瞬间不应该删草稿').toBe(200)
    },
)

test.describe('手机端布局', () => {
  test.skip(
      ({ page }) => !isMobile(page),
      '只在手机视口下有意义',
  )

  test('整页只有一条纵向滚动', async ({ page }) => {
    await openNewJournal(page)

    const scrollers = await page
        .locator('.editor-page, .editor-page *')
        .evaluateAll(nodes =>
            nodes
                // 关着的弹窗遮罩也带 overflow，但它 display:none，滚不了任何东西。
                // 模板弹窗没有 append-to-body，DOM 就挂在 .editor-page 里面。
                .filter(node => node.getClientRects().length > 0)
                .filter(node =>
                    ['auto', 'scroll'].includes(
                        getComputedStyle(node).overflowY,
                    ),
                )
                .map(node =>
                    node.className.toString().slice(0, 40),
                ),
        )

    // 允许 Bottom Sheet 内部有自己的滚动区，但正文链路上不能层层嵌套
    expect(
        scrollers.filter(
            className =>
                !/meta-inner|media-side|config-form|tabs__content/.test(
                    className,
                ),
        ),
    ).toEqual(['editor-page'])
  })

  test('底部工具栏固定可见，不遮住正文', async ({ page }) => {
    await openNewJournal(page)

    const toolbar = page.locator('.editor-toolbar')
    await expect(toolbar).toBeVisible()

    const box = await toolbar.boundingBox()
    const viewport = page.viewportSize()

    expect(box).not.toBeNull()
    expect(viewport).not.toBeNull()

    expect(
        Math.round(box!.y + box!.height),
    ).toBeLessThanOrEqual(viewport!.height + 1)

    await expect(
        page.locator('.editor-toolbar button'),
    ).toHaveCount(6)
  })

  test('顶部只留返回、保存状态和更多', async ({ page }) => {
    await openNewJournal(page)

    await expect(
        page.locator('.editor-top .editor-actions'),
    ).toBeHidden()

    await expect(page.locator('.editor-more')).toBeVisible()
    await expect(
        page.locator('.editor-save-state'),
    ).toBeVisible()
  })

  test('日记信息是从下方推上来的一层，退开就收起', async ({ page }) => {
    await openNewJournal(page)

    const sheet = page.locator('.editor-meta-group')
    await expect(sheet).not.toHaveClass(/is-open/)

    await page.locator('.editor-more').click()
    await expect(sheet).toHaveClass(/is-open/)

    await page.locator('.editor-sheet-backdrop').click()
    await expect(sheet).not.toHaveClass(/is-open/)
  })

  test('底部工具栏能直接插入标题和引用', async ({ page }) => {
    await openNewJournal(page)
    await writeParagraphs(page, ['先写一段正文。'])

    await page
        .locator('.editor-toolbar button', { hasText: '标题' })
        .click()

    await expect(
        page.locator('.block-inline--heading'),
    ).toHaveCount(1)

    // 不该弹配置窗，光标应当直接落在新标题上
    await expect(
        page.locator('.block-config-dialog'),
    ).toHaveCount(0)

    await expect(
        page.locator('.block-inline--heading textarea'),
    ).toBeFocused()
  })

  test('快捷组件弹出软键盘后光标仍在可见区域', async ({ page }) => {
    await openNewJournal(page)

    for (let index = 0; index < 9; index++) {
      await page
          .locator('.editor-toolbar button', { hasText: '标题' })
          .click()

      await page
          .locator('.block-inline--heading textarea')
          .last()
          .fill('小标题 ' + index)
    }

    const input = page
        .locator('.block-inline--heading textarea')
        .last()

    await expect(input).toBeFocused()

    await page.evaluate(() => {
      const viewport = window.visualViewport

      if (!viewport) {
        throw new Error('当前浏览器不支持 visualViewport')
      }

      Object.defineProperty(viewport, 'height', {
        configurable: true,
        value: 420,
      })

      viewport.dispatchEvent(new Event('resize'))
    })

    await expect
        .poll(async () => {
          const [inputBox, toolbarBox] = await Promise.all([
            input.boundingBox(),
            page.locator('.editor-toolbar').boundingBox(),
          ])

          return (
              !!inputBox &&
              !!toolbarBox &&
              inputBox.y + inputBox.height <= toolbarBox.y - 8
          )
        })
        .toBeTruthy()
  })

  test('添加内容先给常用几项，正文不在其中', async ({ page }) => {
    await openNewJournal(page)

    await page
        .locator('.editor-toolbar button', { hasText: '内容' })
        .click()

    const quick = page.locator(
        '.block-catalog--quick > button',
    )

    await expect(quick).toHaveCount(8)
    await expect(
        quick.filter({ hasText: '正文' }),
    ).toHaveCount(0)

    await page.locator('.block-catalog-more').click()

    await expect(
        page.locator('.block-catalog > button'),
    ).toHaveCount(29)
  })

  test(
      '@smoke 图片四个设置页都能滚到底，选完选项不跑位，组件可双击编辑',
      async ({ page }) => {
        await openNewJournal(page)

        await page
            .locator('.editor-toolbar button', { hasText: '内容' })
            .click()

        await page
            .locator('.block-catalog--quick > button')
            .filter({ hasText: '单张图片' })
            .click()

        const dialog = page.locator('.block-config-dialog')
        /*
         * 滚的是整张表单，不是 Tab 内容区。
         *
         * 手机上这里只留一个滚动区：以前是三层嵌套（表单自己滚、四个 Tab 共用的内容区滚、
         * 图片选择器还有一层），手指往下一划滚的是哪一层全看落点在哪。现在 Tab 内容区
         * 按内容自然铺开，scrollTop 恒为 0——对着它设 scrollHeight 什么也不会发生。
         */
        const scroller = dialog.locator('.block-config-form')
        const footer = dialog.locator('.el-dialog__footer')

        await expect(dialog).toBeVisible()

        for (const name of ['内容', '版式', '外观', '图注']) {
          await dialog
              .getByRole('tab', { name, exact: true })
              .click()

          await scroller.evaluate(element => {
            element.scrollTop = element.scrollHeight
          })

          const last = dialog
              .locator(
                  '.el-tab-pane:visible .image-setting-section > *',
              )
              .last()

          await expect(last).toBeVisible()

          const [lastBox, footerBox] = await Promise.all([
            last.boundingBox(),
            footer.boundingBox(),
          ])

          expect(lastBox).not.toBeNull()
          expect(footerBox).not.toBeNull()

          expect(
              lastBox!.y + lastBox!.height,
          ).toBeLessThanOrEqual(footerBox!.y + 1)
        }

        await dialog
            .getByRole('tab', { name: '外观', exact: true })
            .click()

        /*
         * 选项现在是平铺按钮，不再是下拉。
         *
         * 原来这里测的是「下拉选完之后滚动位置要回到原处」——那是为了修一个具体的毛病：
         * el-select 的浮层一开一关会把整个设置区滚走。按钮没有浮层，那个毛病从根上没有了，
         * 但「选一下不该让页面动」这条要求还在，所以断言保留，触发方式换成点按钮。
         */
        const effect = dialog
            .locator('.image-setting-section label')
            .filter({ hasText: '电脑悬停效果' })
            .locator('.option-chips')

        await effect.scrollIntoViewIfNeeded()

        const before = await scroller.evaluate(
            element => element.scrollTop,
        )

        const liftChip = effect.getByRole('radio', { name: '轻轻浮起' })
        await liftChip.click()

        // 选中态要落在被点的那一个上，而不是只把值写进了数据
        await expect(liftChip).toHaveAttribute('aria-checked', 'true')
        await expect
            .poll(() =>
                scroller.evaluate(element => element.scrollTop),
            )
            .toBe(before)

        await dialog
            .getByRole('button', { name: '确认插入' })
            .click()

        const card = page
            .locator('.block-editor-card')
            .last()

        await card.dblclick()
        await expect(dialog).toBeVisible()

        await expect(
            dialog.getByRole('button', { name: '确认修改' }),
        ).toBeVisible()
      },
  )
})