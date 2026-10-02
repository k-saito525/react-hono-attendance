import type { Page } from '@playwright/test'

/**
 * E2E 用 DB には api の seed がそのまま入っている（global-setup.ts）。
 *   admin    : sato@example.com / tanaka@example.com
 *   employee : suzuki@example.com / takahashi@example.com
 */
export const PASSWORD = 'password123'

/** ログイン画面が開いている前提で、入力して送信する */
export const login = async (page: Page, email: string, password = PASSWORD) => {
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード').fill(password)
  await page.getByRole('button', { name: 'ログイン' }).click()
}
