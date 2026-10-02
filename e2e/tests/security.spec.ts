import { expect, test } from '@playwright/test'
import { login } from './helpers'

/**
 * 実際のブラウザでしか確かめられないセキュリティの性質。
 * MSW を使った画面のテストでは、Cookie の属性や API 側の防御は検証できない。
 */

test('セッションの Cookie は JavaScript から読めず、SameSite=Lax で発行される', async ({
  page,
  context,
}) => {
  await page.goto('/login')
  await login(page, 'suzuki@example.com')
  await expect(page.getByRole('heading', { name: '鈴木 次郎 さん、こんにちは' })).toBeVisible()

  const sid = (await context.cookies()).find((c) => c.name === 'sid')
  expect(sid).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' })

  // HttpOnly なので、ページの JavaScript（= XSS があった場合の攻撃コード）からは見えない
  expect(await page.evaluate(() => document.cookie)).not.toContain('sid=')
})

/**
 * 画面側の権限チェックは「見せない」ための UX にすぎない。
 * 画面を通さずに API を直接叩かれても守られていることを確かめる。
 */
test.describe('API を直接叩いても守られている', () => {
  test('未ログインなら 401', async ({ request }) => {
    expect((await request.get('/api/admin/members')).status()).toBe(401)
  })

  test('employee のセッションで管理者用 API を叩くと 403', async ({ page }) => {
    await page.goto('/login')
    await login(page, 'suzuki@example.com')
    await expect(page.getByRole('heading', { name: '鈴木 次郎 さん、こんにちは' })).toBeVisible()

    // page.request はブラウザと Cookie を共有する（= ログイン中の本人として叩く）
    expect((await page.request.get('/api/admin/members')).status()).toBe(403)
  })
})
