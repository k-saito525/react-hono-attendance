import { defineConfig, devices } from '@playwright/test'
// 設定ファイルは Playwright が直接読み込むので、拡張子まで書く
import { resolveE2EDatabaseUrl } from './db.ts'

const isCI = Boolean(process.env.CI)

/**
 * 開発中の dev サーバ（web 5173 / api 3000）や開発用 DB とぶつからないよう、
 * E2E は別のポートと別の DB を使う。
 */
const WEB_PORT = 4173
const API_PORT = 3100
const databaseUrl = resolveE2EDatabaseUrl()

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // CI で test.only が残っていたら失敗させる（他のテストを黙って飛ばさないため）
  forbidOnly: isCI,
  // CI では再試行する。再試行で通ったものはレポートに「flaky」と出るので、不安定さは隠れない
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  globalSetup: './global-setup.ts',

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    // 失敗して再試行したときだけ、操作の記録（トレース）を残す
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  /**
   * テストの前に API と web を起動し、終わったら止める。
   *
   * web は本番ビルドを vite preview で配信する（利用者が実際に受け取るものを確かめるため）。
   * 既に起動しているサーバは使い回さない。別の DB に繋がったサーバを掴むと、
   * E2E 用 DB を作り直しても反映されないため。
   */
  webServer: [
    {
      name: 'api',
      command: 'pnpm -F @attendance/api exec tsx src/index.ts',
      cwd: '..',
      url: `http://localhost:${API_PORT}/api/health`,
      env: { DATABASE_URL: databaseUrl, PORT: String(API_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: 'web',
      command: `pnpm -F @attendance/web build && pnpm -F @attendance/web preview --port ${WEB_PORT} --strictPort`,
      cwd: '..',
      url: `http://localhost:${WEB_PORT}`,
      env: { API_ORIGIN: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
