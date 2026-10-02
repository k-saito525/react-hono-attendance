import type { InferResponseType } from 'hono/client'
import { HttpResponse, http } from 'msw'
import type { client } from '../lib/api'

/**
 * API のモック。レスポンスの型は API のルート定義から借りる。
 * API 側で返す形が変わると、ここがコンパイルエラーになる
 * （モックだけが古い形のまま通ってしまう事故を防ぐ）。
 */

type Me = InferResponseType<typeof client.api.auth.me.$get, 200>['user']
type Members = InferResponseType<typeof client.api.admin.members.$get, 200>
type LoginOk = InferResponseType<typeof client.api.auth.login.$post, 200>
type LoginValidationError = InferResponseType<typeof client.api.auth.login.$post, 400>

export const admin: Me = {
  id: '01a0dee3-0492-7ead-910e-603c18b41038',
  name: '佐藤 太郎',
  email: 'sato@example.com',
  role: 'admin',
  hiredOn: '2026-04-01',
}

export const employee: Me = {
  id: '01a0dee3-049b-719e-a8a9-d93b06433643',
  name: '鈴木 次郎',
  email: 'suzuki@example.com',
  role: 'employee',
  hiredOn: '2026-04-01',
}

const unauthorized = () => HttpResponse.json({ message: 'ログインが必要です' }, { status: 401 })

/** GET /api/auth/me。null なら未ログイン（401） */
export const meHandler = (user: Me | null) =>
  http.get('/api/auth/me', () => (user ? HttpResponse.json({ user }) : unauthorized()))

/** POST /api/auth/login が成功する */
export const loginSucceeds = (user: Me) =>
  http.post('/api/auth/login', () => HttpResponse.json<LoginOk>({ user }))

/** POST /api/auth/login が 401（パスワード違い・存在しないメール） */
export const loginFails = () =>
  http.post('/api/auth/login', () =>
    HttpResponse.json(
      { message: 'メールアドレスまたはパスワードが正しくありません' },
      { status: 401 },
    ),
  )

/** POST /api/auth/login が 400（入力エラー） */
export const loginRejectsInput = (errors: LoginValidationError['errors']) =>
  http.post('/api/auth/login', () =>
    HttpResponse.json<LoginValidationError>(
      { message: '入力内容に誤りがあります', errors },
      { status: 400 },
    ),
  )

export const logoutSucceeds = () =>
  http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 }))

/** GET /api/admin/members。status を渡せばそのエラーを返す */
export const membersHandler = (result: Members | 401 | 403) =>
  http.get('/api/admin/members', () =>
    typeof result === 'number'
      ? HttpResponse.json({ message: 'error' }, { status: result })
      : HttpResponse.json<Members>(result),
  )
