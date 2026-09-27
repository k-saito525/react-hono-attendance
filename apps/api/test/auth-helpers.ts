import { eq } from 'drizzle-orm'
import { testClient } from 'hono/testing'
import { expect } from 'vitest'
import app from '../src/app'
import { hashToken, SESSION_COOKIE } from '../src/auth/session'
import { db } from '../src/db/client'
import { sessions } from '../src/db/schema'

/** 型付きのテスト用クライアント。web 側の hc と同じ型でルートを叩ける */
export const client = testClient(app)

/** Set-Cookie ヘッダからセッショントークンを取り出す。無ければ null */
export const readSessionToken = (res: { headers: Headers }): string | null => {
  const match = res.headers
    .get('set-cookie')
    ?.match(new RegExp(`(?:^|,\\s*)${SESSION_COOKIE}=([^;]*)`))
  return match?.[1] || null
}

/**
 * 同一オリジンからのリクエストであることを示すヘッダ。
 *
 * 本文なしの POST（ログアウトなど）は Content-Type が無く、csrf() はそれを
 * フォーム送信（text/plain）とみなして Origin を確認する。実際のブラウザは
 * POST に必ず Origin を付けるので、テストでもそれに合わせる。
 * testClient の既定のオリジンは http://localhost。
 */
export const sameOrigin = { Origin: 'http://localhost' }

/** リクエストに Cookie を付けるためのオプション */
export const withSession = (token: string) => ({
  headers: { ...sameOrigin, Cookie: `${SESSION_COOKIE}=${token}` },
})

/** ログインしてトークンを返す。factories の createUser のパスワードは password123 */
export const login = async (email: string, password = 'password123'): Promise<string> => {
  const res = await client.api.auth.login.$post({ json: { email, password } })
  const token = readSessionToken(res)
  if (res.status !== 200 || !token) throw new Error(`ログインに失敗しました: ${res.status}`)
  return token
}

/** セッションの期限を書き換える。時計を進める代わりに、DB 側の期限を動かして検証する */
export const setSessionExpiry = async (
  token: string,
  expiry: { expiresAt?: Date; absoluteExpiresAt?: Date },
) => {
  await db
    .update(sessions)
    .set(expiry)
    .where(eq(sessions.id, hashToken(token)))
}

export const findSession = async (token: string) => {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, hashToken(token)))
  return row
}

/**
 * ステータスを検証しつつ、レスポンスの型をそのステータスのものに絞り込む。
 * RPC のレスポンスはステータスごとの union なので、絞り込まないと json() の型が決まらない。
 */
export function assertStatus<R extends { status: number }, S extends R['status']>(
  res: R,
  status: S,
): asserts res is Extract<R, { status: S }> {
  expect(res.status).toBe(status)
}
