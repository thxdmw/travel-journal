import { test, expect } from '@playwright/test';

const PHOTO = '/img/home-hero-kyoto-960.webp';

/*
 * 主题贴纸曾经用真实 <img> 插入日记正文，导致灯箱的收图逻辑把贴纸也当成照片。
 * 这里直接提供固定公开日记 Fixture，不依赖管理员账号、上传文件或数据库状态。
 */
test.describe('主题贴纸与日记照片灯箱隔离', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/public/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data: any = null;
      if (path === '/api/public/profile') {
        data = { theme: null };
      } else if (path === '/api/public/journals/e2e-sticker-lightbox') {
        data = {
          journal: {
            id: 1, title: '贴纸与正文照片隔离测试', slug: 'e2e-sticker-lightbox',
            excerpt: '', occurredOn: '2026-01-01', tripTitle: null, cityName: null,
          },
          contentJson: {
            schemaVersion: 1,
            blocks: [{
              id: 'block_e2e_sticker_photo', type: 'image', version: 1, title: '',
              data: { previewUrl: PHOTO, caption: '测试照片' }, settings: {},
            }],
          },
          media: [], route: [], previousSlug: null, nextSlug: null,
          theme: {
            themeKey: 'e2e-sticker-theme', baseThemeKey: 'base',
            definitionJson: {
              stickers: { density: 'medium', items: [{ asset: 'classic-compass', area: 'image-corner' }] },
              interactions: { stickerClick: 'pop' },
            },
          },
        };
      }
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ code: 'OK', message: 'success', data }) });
    });
    await page.goto('/#/journals/e2e-sticker-lightbox');
    await expect(page.locator('.journal-document')).toBeVisible();
  });

  test('@smoke 贴纸不进入日记照片灯箱，正文照片仍可正常查看大图', async ({ page }) => {
    const sticker = page.locator('.tj-sticker').first();
    await expect(sticker).toBeAttached();
    expect(await sticker.evaluate(element => element.tagName)).toBe('SPAN');
    await expect(sticker).toHaveAttribute('data-theme-decoration', 'sticker');

    await sticker.click({ force: true });
    await expect(page.locator('.photo-lightbox')).toHaveCount(0);

    // 第二层防护：即便日后有人把普通 <img> 放进正文容器，它也不能进入照片组。
    await page.locator('.journal-document').evaluate((root, src) => {
      const decoration = document.createElement('img');
      decoration.className = 'test-non-journal-image';
      decoration.src = String(src);
      root.appendChild(decoration);
    }, PHOTO);
    await page.locator('.test-non-journal-image').click();
    await expect(page.locator('.photo-lightbox')).toHaveCount(0);

    // 1px Fixture 的实际可点区域很小，且右上角贴纸可能与它重叠；强制点击图片中心，
    // 这里验证的是事件语义过滤，不验证命中区域。
    await page.locator('.journal-figure img').click({ force: true });
    const lightbox = page.locator('.photo-lightbox');
    await expect(lightbox).toBeVisible();
    await expect(lightbox.locator('.lightbox-count')).toHaveCount(0);
    expect(await lightbox.locator('figure img').getAttribute('src')).not.toContain('/assets/themes/stickers/');

    await page.locator('.lightbox-close').click();
    await expect(lightbox).toHaveCount(0);
  });
});
