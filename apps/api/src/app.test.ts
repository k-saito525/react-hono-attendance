import { testClient } from 'hono/testing'
import { describe, expect, it } from 'vitest'
import { createUser } from '../test/factories'
import app from './app'

/**
 * testClient は app.fetch を直接呼ぶので、サーバを起動せずに済む。
 * しかも web 側の hc と同じ型付きクライアントなので、
 * 存在しないルートや誤ったレスポンスの扱いはコンパイルエラーになる。
 */
const client = testClient(app)

describe('GET /api/health', () => {
  it('status: ok を返す', async () => {
    const res = await client.api.health.$get()

    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('ok')
  })
})

describe('GET /api/users', () => {
  it('パスワードハッシュを含まない（返す項目を固定する）', async () => {
    await createUser()

    const [user] = await (await client.api.users.$get()).json()

    /**
     * 「passwordHash が無いこと」ではなく「返す項目がこれだけであること」を検証する。
     * 前者だと、users に別の機密列が増えたときに素通りしてしまう。
     * 項目を増やしたときは、意図してこのテストを更新すること。
     */
    expect(Object.keys(user ?? {}).sort()).toEqual(['email', 'hiredOn', 'id', 'name', 'role'])
  })

  it('入社日順、同じ入社日なら名前順に並ぶ', async () => {
    await createUser({ name: 'Carol', hiredOn: '2026-07-01' })
    await createUser({ name: 'Bob', hiredOn: '2026-04-01' })
    await createUser({ name: 'Alice', hiredOn: '2026-04-01' })

    const body = await (await client.api.users.$get()).json()

    expect(body.map((u) => u.name)).toEqual(['Alice', 'Bob', 'Carol'])
  })
})
