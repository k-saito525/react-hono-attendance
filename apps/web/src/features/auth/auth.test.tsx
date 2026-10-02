import { screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import {
  admin,
  employee,
  loginFails,
  loginRejectsInput,
  loginSucceeds,
  logoutSucceeds,
  meHandler,
  membersHandler,
} from '../../test/handlers'
import { renderApp } from '../../test/render'
import { server } from '../../test/server'

/** ログインフォームに入力して送信する */
const submitLogin = async (
  user: ReturnType<typeof renderApp>['user'],
  { email, password }: { email: string; password: string },
) => {
  if (email) await user.type(await screen.findByLabelText('メールアドレス'), email)
  if (password) await user.type(screen.getByLabelText('パスワード'), password)
  await user.click(screen.getByRole('button', { name: 'ログイン' }))
}

describe('認証ガード', () => {
  it('未ログインで / を開くと、戻り先付きでログイン画面へ移る', async () => {
    server.use(meHandler(null))

    const { router } = renderApp('/')

    expect(await screen.findByLabelText('メールアドレス')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toEqual({ redirect: '/' })
  })

  it('ログイン済みで /login を開くと、ホームへ移る', async () => {
    server.use(meHandler(admin))

    const { router } = renderApp('/login')

    expect(await screen.findByText('佐藤 太郎 さん、こんにちは')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })
})

describe('ログイン', () => {
  it('成功すると、元のページ（戻り先）へ移る', async () => {
    server.use(meHandler(null), loginSucceeds(admin), membersHandler([admin, employee]))

    const { user, router } = renderApp('/admin/members')
    await submitLogin(user, { email: 'sato@example.com', password: 'password123' })

    expect(await screen.findByRole('heading', { name: 'メンバー' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/members')
  })

  it('形式の誤りは、API を呼ばずにその場で表示する', async () => {
    const loginCalled = vi.fn()
    server.use(
      meHandler(null),
      http.post('/api/auth/login', () => {
        loginCalled()
        return HttpResponse.json({ message: 'unexpected' }, { status: 500 })
      }),
    )

    const { user } = renderApp('/login')
    await submitLogin(user, { email: 'not-an-email', password: '' })

    expect(await screen.findByText('メールアドレスの形式が正しくありません')).toBeInTheDocument()
    expect(screen.getByText('パスワードを入力してください')).toBeInTheDocument()
    expect(screen.getByLabelText('メールアドレス')).toHaveAttribute('aria-invalid', 'true')
    expect(loginCalled).not.toHaveBeenCalled()
  })

  it('認証に失敗したら、共通のメッセージを表示する（どちらが違うかは明かさない）', async () => {
    server.use(meHandler(null), loginFails())

    const { user, router } = renderApp('/login')
    await submitLogin(user, { email: 'sato@example.com', password: 'wrong' })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'メールアドレスまたはパスワードが正しくありません',
    )
    expect(router.state.location.pathname).toBe('/login')
  })

  it('API の入力エラー（400）を、該当する欄に表示する', async () => {
    server.use(meHandler(null), loginRejectsInput({ email: ['このメールアドレスは使えません'] }))

    const { user } = renderApp('/login')
    await submitLogin(user, { email: 'sato@example.com', password: 'password123' })

    expect(await screen.findByText('このメールアドレスは使えません')).toBeInTheDocument()
  })

  it.each([
    ['別サイトの URL', 'https://evil.example'],
    ['プロトコル相対 URL', '//evil.example'],
  ])('戻り先が %s なら無視してホームへ移る（オープンリダイレクト対策）', async (_label, target) => {
    server.use(meHandler(null), loginSucceeds(admin))

    const { user, router } = renderApp(`/login?redirect=${encodeURIComponent(target)}`)
    await submitLogin(user, { email: 'sato@example.com', password: 'password123' })

    expect(await screen.findByText('佐藤 太郎 さん、こんにちは')).toBeInTheDocument()
    expect(router.state.location.href).toBe('/')
  })
})

describe('ログアウト', () => {
  it('ログイン画面へ戻り、前の人のデータをキャッシュに残さない', async () => {
    server.use(meHandler(admin), membersHandler([admin, employee]), logoutSucceeds())

    const { user, router, queryClient } = renderApp('/admin/members')
    expect(await screen.findByText('鈴木 次郎')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'ログアウト' }))

    expect(await screen.findByLabelText('メールアドレス')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(queryClient.getQueryData(['admin', 'members'])).toBeUndefined()
    expect(queryClient.getQueryData(['auth', 'me'])).toBeNull()
  })
})

describe('セッション切れ', () => {
  it('使っている途中で API が 401 を返したら、戻り先付きでログイン画面へ移る', async () => {
    // ホームを開いた時点ではログイン中。その後メンバー一覧の取得でセッション切れが判明する
    server.use(meHandler(admin), membersHandler(401))

    const { user, router } = renderApp('/')
    await user.click(await screen.findByRole('link', { name: 'メンバー' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toEqual({ redirect: '/admin/members' })
  })
})
