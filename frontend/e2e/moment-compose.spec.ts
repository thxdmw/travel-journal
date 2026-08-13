import { test, expect } from '@playwright/test';
import { createTestTrip, login } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('@smoke 白天整理后晚上追加仍写入同一篇日记', async ({ page }) => {
  const tripId = await createTestTrip(page);
  const day = '2099-01-12';
  const seed = await page.evaluate(async ({ tripId, day }) => {
    const api = (window as any).TravelApi.admin;
    const base = {
      tripId, occurredLocalDate: day, occurredZoneId: 'Asia/Shanghai', utcOffsetMinutes: 480,
      placeName: 'E2E 测试地点', latitude: null, longitude: null, mood: '平静',
    };
    await api.createMoment({
      ...base, clientId: `e2e-morning-${Date.now()}`,
      occurredAt: `${day}T08:00:00+08:00`, content: '上午整理的随手记',
    });
    const composed = await api.composeMoments({ tripId, day, journalId: null, replace: false, useAi: false });
    await api.createMoment({
      ...base, clientId: `e2e-evening-${Date.now()}`,
      occurredAt: `${day}T20:00:00+08:00`, content: '晚上新增加的随手记',
    });
    return { journalId: Number(composed.journalId) };
  }, { tripId, day });

  await page.goto(`/admin/#/moments?tripId=${tripId}`);
  const group = page.locator('.moment-day').filter({ hasText: '晚上新增加的随手记' });
  await expect(group).toBeVisible();

  const requestPromise = page.waitForRequest(request =>
    request.method() === 'POST' && request.url().endsWith('/api/admin/moments/compose'));
  await group.getByRole('button', { name: '整理成日记', exact: true }).click();
  await page.getByRole('button', { name: '追加', exact: true }).click();
  const request = await requestPromise;
  expect(request.postDataJSON().journalId).toBe(seed.journalId);
  await page.waitForURL(new RegExp(`#/journals/${seed.journalId}`), { timeout: 20_000 });

  const journalIds = await page.evaluate(async ({ tripId, day }) => {
    const rows = await (window as any).TravelApi.admin.moments(tripId, day, false);
    return [...new Set(rows.map((row: any) => Number(row.journalEntryId)))];
  }, { tripId, day });
  expect(journalIds).toEqual([seed.journalId]);
});
