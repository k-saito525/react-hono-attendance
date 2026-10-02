import { expect, test } from '@playwright/test'
import { login } from './helpers'

test.describe('ログイン', () => {
  test('未ログインで開いたページに、ログイン後に戻ってくる', async ({ page }) => {
    await page.goto('/admin/members')
    await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin%2Fmembers$/)

    await login(page, 'sato@example.com')

    await expect(page).toHaveURL(/\/admin\/members$/)
    const table = page.getByRole('table')
    for (const name of ['佐藤 太郎', '田中 花子', '鈴木 次郎', '高橋 三郎']) {
      await expect(table).toContainText(name)
    }
  })

  test('パスワードが違うと、共通のメッセージを出してログイン画面に留まる', async ({ page }) => {
    await page.goto('/login')

    await login(page, 'sato@example.com', 'wrong-password')

    await expect(page.getByRole('alert')).toHaveText(
      'メールアドレスまたはパスワードが正しくありません',
    )
    await expect(page).toHaveURL(/\/login$/)
  })

  test('リロードしてもログイン状態が保たれる（Cookie のセッション）', async ({ page }) => {
    await page.goto('/login')
    await login(page, 'suzuki@example.com')
    await expect(page.getByRole('heading', { name: '鈴木 次郎 さん、こんにちは' })).toBeVisible()

    await page.reload()

    await expect(page.getByRole('heading', { name: '鈴木 次郎 さん、こんにちは' })).toBeVisible()
  })

  test('戻り先が別サイトなら無視してホームへ移る（オープンリダイレクト対策）', async ({ page }) => {
    await page.goto(`/login?redirect=${encodeURIComponent('//evil.example')}`)

    await login(page, 'sato@example.com')

    await expect(page.getByRole('heading', { name: '佐藤 太郎 さん、こんにちは' })).toBeVisible()
    expect(new URL(page.url()).origin).toBe('http://localhost:4173')
  })
})

test.describe('ログアウト', () => {
  test('ログアウト後は、ブラウザの「戻る」でも URL の直打ちでも中に入れない', async ({ page }) => {
    await page.goto('/login')
    await login(page, 'sato@example.com')
    await expect(page.getByRole('heading', { name: '佐藤 太郎 さん、こんにちは' })).toBeVisible()

    await page.getByRole('button', { name: 'ログアウト' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await page.goBack()
    await expect(page).toHaveURL(/\/login/)

    await page.goto('/')
    await expect(page).toHaveURL(/\/login\?redirect=%2F$/)
  })
})

test.describe('権限', () => {
  test('employee にはメンバーへのリンクが無く、直接開いても「権限がありません」', async ({
    page,
  }) => {
    await page.goto('/login')
    await login(page, 'suzuki@example.com')
    await expect(page.getByRole('heading', { name: '鈴木 次郎 さん、こんにちは' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'メンバー' })).toHaveCount(0)

    await page.goto('/admin/members')

    await expect(page.getByRole('heading', { name: '権限がありません' })).toBeVisible()
  })
})
