import { defineConfig, devices } from '@playwright/test';

/*
 * 端到端测试只用于本地验证，不参与 Maven 打包和 Docker 构建。
 *
 * 需要一个已经跑起来的应用实例（连着真实的 PostgreSQL 和 MinIO），通过环境变量指过去：
 *   E2E_BASE_URL   默认 http://localhost:8080
 *   E2E_ADMIN_USER / E2E_ADMIN_PASS  管理员账号
 *
 * 之所以要有这套测试：移动端编辑器最容易坏的不是 JS 语法，而是软键盘弹起、
 * 浏览器底栏收缩、安全区、Bottom Sheet 叠加这些只有在真机尺寸下才暴露的问题。
 * 手工每次回归三种机型的成本太高，改一处 CSS 常常修好 A 又碰坏 B。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8080',
    // 本地可复用已安装的 Edge / Chrome；CI 镜像仍使用自带的 Chromium。
    channel: process.env.E2E_BROWSER_CHANNEL as 'chrome' | 'msedge' | undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  },
  projects: [
    { name: 'iphone-13', use: { ...devices['iPhone 13'] } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
