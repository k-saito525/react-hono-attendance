import { describe, expect, it } from 'vitest'
import {
  assertStatus,
  client,
  findSession,
  login,
  readSessionToken,
  sameOrigin,
  setSessionExpiry,
  withSession,
} from '../../test/auth-helpers'
import { createUser } from '../../test/factories'
import { hashToken, IDLE_TIMEOUT_MS } from '../auth/session'
import { db } from '../db/client'
import { sessions } from '../db/schema'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

describe('POST /api/auth/login', () => {
  it('成功すると HttpOnly / SameSite=Lax のセッション Cookie を発行する', async () => {
    const user = await createUser({ email: 'sato@example.com' })

    const res = await client.api.auth.login.$post({
      json: { email: 'sato@example.com', password: 'password123' },
    })

    assertStatus(res, 200)
    expect((await res.json()).user.id).toBe(user.id)

    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/^sid=[\w-]+;/)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toContain('Path=/')
  })

  it('メールアドレスの大文字小文字は区別しない', async () => {
    await createUser({ email: 'sato@example.com' })

    const res = await client.api.auth.login.$post({
      json: { email: 'Sato@Example.COM', password: 'password123' },
    })

    expect(res.status).toBe(200)
  })

  it('DB にはトークンそのものではなく、そのハッシュだけを保存する', async () => {
    await createUser({ email: 'sato@example.com' })
    const token = await login('sato@example.com')

    const rows = await db.select().from(sessions)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(hashToken(token))
    // どの列にもトークンの生の値が含まれていない
    expect(JSON.stringify(rows)).not.toContain(token)
  })

  it('パスワード違いと存在しないメールで、まったく同じ応答を返す', async () => {
    await createUser({ email: 'sato@example.com' })

    const wrongPassword = await client.api.auth.login.$post({
      json: { email: 'sato@example.com', password: 'wrong-password' },
    })
    const unknownEmail = await client.api.auth.login.$post({
      json: { email: 'nobody@example.com', password: 'password123' },
    })

    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    expect(await wrongPassword.json()).toEqual(await unknownEmail.json())
    expect(readSessionToken(wrongPassword)).toBeNull()
    expect(readSessionToken(unknownEmail)).toBeNull()
  })

  it('入力の形式が不正なら 400 とフィールドごとのエラーを返す', async () => {
    const res = await client.api.auth.login.$post({
      json: { email: 'not-an-email', password: '' },
    })

    assertStatus(res, 400)
    const body = await res.json()
    expect(body.errors.email).toBeDefined()
    expect(body.errors.password).toBeDefined()
  })

  it('ログインし直すと、それまでのセッションは無効になる', async () => {
    await createUser({ email: 'sato@example.com' })
    const first = await login('sato@example.com')

    const res = await client.api.auth.login.$post(
      { json: { email: 'sato@example.com', password: 'password123' } },
      withSession(first),
    )
    const second = readSessionToken(res)

    expect(second).not.toBeNull()
    expect(second).not.toBe(first)
    expect((await client.api.auth.me.$get(undefined, withSession(first))).status).toBe(401)
    expect(await db.$count(sessions)).toBe(1)
  })
})

describe('GET /api/auth/me', () => {
  it('Cookie が無ければ 401', async () => {
    expect((await client.api.auth.me.$get()).status).toBe(401)
  })

  it('改ざんされたトークンなら 401 を返し、Cookie を消させる', async () => {
    const res = await client.api.auth.me.$get(undefined, withSession('forged-token'))

    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('ログイン中なら本人の情報を返す。返す項目は許可リストのものだけ', async () => {
    const user = await createUser({ email: 'sato@example.com' })
    const token = await login('sato@example.com')

    const res = await client.api.auth.me.$get(undefined, withSession(token))

    assertStatus(res, 200)
    const body = await res.json()
    expect(body.user.id).toBe(user.id)
    expect(Object.keys(body.user).sort()).toEqual(['email', 'hiredOn', 'id', 'name', 'role'])
  })
})

describe('POST /api/auth/logout', () => {
  it('セッションを DB から消し、以後そのトークンは使えない', async () => {
    await createUser({ email: 'sato@example.com' })
    const token = await login('sato@example.com')

    const res = await client.api.auth.logout.$post(undefined, withSession(token))

    expect(res.status).toBe(204)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(await findSession(token)).toBeUndefined()
    expect((await client.api.auth.me.$get(undefined, withSession(token))).status).toBe(401)
  })

  it('ログインしていなくても 204（ログアウトしたいという目的は満たされている）', async () => {
    expect((await client.api.auth.logout.$post(undefined, { headers: sameOrigin })).status).toBe(
      204,
    )
  })
})

/**
 * 時計を進める代わりに、DB 側の期限を書き換えて検証する。
 * 実際のコードは Date.now() と DB の期限を比べるだけなので、どちらを動かしても等価。
 */
describe('セッションの期限', () => {
  const setup = async () => {
    await createUser({ email: 'sato@example.com' })
    return login('sato@example.com')
  }

  it('アイドル期限を過ぎたら 401 になり、行も消える', async () => {
    const token = await setup()
    await setSessionExpiry(token, { expiresAt: new Date(Date.now() - 1000) })

    expect((await client.api.auth.me.$get(undefined, withSession(token))).status).toBe(401)
    expect(await findSession(token)).toBeUndefined()
  })

  it('アイドル期限が残っていても、絶対期限を過ぎたら 401', async () => {
    const token = await setup()
    await setSessionExpiry(token, { absoluteExpiresAt: new Date(Date.now() - 1000) })

    expect((await client.api.auth.me.$get(undefined, withSession(token))).status).toBe(401)
  })

  it('残りが半分を切っていたら延長し、Cookie も付け直す', async () => {
    const token = await setup()
    await setSessionExpiry(token, { expiresAt: new Date(Date.now() + 2 * DAY_MS) })

    const res = await client.api.auth.me.$get(undefined, withSession(token))

    expect(res.status).toBe(200)
    expect(readSessionToken(res)).toBe(token)
    const remaining = ((await findSession(token))?.expiresAt.getTime() ?? 0) - Date.now()
    expect(remaining).toBeGreaterThan(IDLE_TIMEOUT_MS - HOUR_MS)
  })

  it('半分以上残っていれば延長しない（DB に書き込まない）', async () => {
    const token = await setup()
    const before = (await findSession(token))?.expiresAt

    const res = await client.api.auth.me.$get(undefined, withSession(token))

    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect((await findSession(token))?.expiresAt).toEqual(before)
  })

  it('延長しても絶対期限は超えない', async () => {
    const token = await setup()
    const absoluteExpiresAt = new Date(Date.now() + DAY_MS)
    await setSessionExpiry(token, {
      expiresAt: new Date(Date.now() + 12 * HOUR_MS),
      absoluteExpiresAt,
    })

    await client.api.auth.me.$get(undefined, withSession(token))

    expect((await findSession(token))?.expiresAt).toEqual(absoluteExpiresAt)
  })
})
