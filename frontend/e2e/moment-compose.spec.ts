import { test, expect } from '@playwright/test'
import type {
    ComposeRequest,
    ComposeResult,
    MomentRequest,
    MomentView,
} from '../src/types/moment'
import {
    adminRequest,
    createTestTrip,
    login,
} from './helpers'

test.beforeEach(async ({ page }) => {
    await login(page)
})

test(
    '@smoke 白天整理后晚上追加仍写入同一篇日记',
    async ({ page }) => {
        const tripId = await createTestTrip(page)
        const day = '2099-01-12'

        const base: MomentRequest = {
            tripId,
            occurredLocalDate: day,
            occurredZoneId: 'Asia/Shanghai',
            utcOffsetMinutes: 480,
            placeName: 'E2E 测试地点',
            latitude: null,
            longitude: null,
            mood: '平静',
        }

        const morningMoment: MomentRequest = {
            ...base,
            clientId: `e2e-morning-${Date.now()}`,
            occurredAt: `${day}T08:00:00+08:00`,
            content: '上午整理的随手记',
        }

        await adminRequest<MomentView>(
            page,
            'POST',
            '/moments',
            morningMoment,
        )

        const composeRequest: ComposeRequest = {
            tripId,
            day,
            journalId: null,
            replace: false,
            useAi: false,
        }

        const composed = await adminRequest<ComposeResult>(
            page,
            'POST',
            '/moments/compose',
            composeRequest,
        )

        const eveningMoment: MomentRequest = {
            ...base,
            clientId: `e2e-evening-${Date.now()}`,
            occurredAt: `${day}T20:00:00+08:00`,
            content: '晚上新增加的随手记',
        }

        await adminRequest<MomentView>(
            page,
            'POST',
            '/moments',
            eveningMoment,
        )

        const journalId = Number(composed.journalId)

        await page.goto(`/admin/#/moments?tripId=${tripId}`)

        const group = page
            .locator('.moment-day')
            .filter({ hasText: '晚上新增加的随手记' })

        await expect(group).toBeVisible()

        const requestPromise = page.waitForRequest(
            request =>
                request.method() === 'POST' &&
                request
                    .url()
                    .endsWith('/api/admin/moments/compose'),
        )

        await group
            .getByRole('button', {
                name: '整理成日记',
                exact: true,
            })
            .click()

        await page
            .getByRole('button', {
                name: '追加',
                exact: true,
            })
            .click()

        const request = await requestPromise

        expect(
            request.postDataJSON().journalId,
        ).toBe(journalId)

        await page.waitForURL(
            new RegExp(`#/journals/${journalId}`),
            { timeout: 20_000 },
        )

        const rows = await adminRequest<MomentView[]>(
            page,
            'GET',
            `/moments?tripId=${tripId}&day=${encodeURIComponent(day)}&unsorted=false`,
        )

        const journalIds = [
            ...new Set(
                rows
                    .map(row => row.journalEntryId)
                    .filter(
                        (id): id is number => id !== null,
                    ),
            ),
        ]

        expect(journalIds).toEqual([journalId])
    },
)