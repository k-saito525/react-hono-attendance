import { describe, expect, it } from 'vitest'
import { assertStatus, client, login, withSession } from '../../test/auth-helpers'
import { createUser } from '../../test/factories'

describe('GET /api/admin/members', () => {
  it('未ログインなら 401', async () => {
    expect((await client.api.admin.members.$get()).status).toBe(401)
  })

  it('employee なら 403', async () => {
    await createUser({ email: 'suzuki@example.com', role: 'employee' })
    const token = await login('suzuki@example.com')

    expect((await client.api.admin.members.$get(undefined, withSession(token))).status).toBe(403)
  })

  it('admin なら全員を返す。返す項目は許可リストのものだけ', async () => {
    await createUser({ email: 'sato@example.com', role: 'admin' })
    await createUser({ role: 'employee' })
    const token = await login('sato@example.com')

    const res = await client.api.admin.members.$get(undefined, withSession(token))

    assertStatus(res, 200)
    const body = await res.json()
    expect(body).toHaveLength(2)
    /**
     * 「passwordHash が無いこと」ではなく「返す項目がこれだけであること」を検証する。
     * 前者だと、users に別の機密列が増えたときに素通りしてしまう。
     */
    for (const member of body) {
      expect(Object.keys(member).sort()).toEqual(['email', 'hiredOn', 'id', 'name', 'role'])
    }
  })

  it('入社日順、同じ入社日なら名前順に並ぶ', async () => {
    await createUser({
      name: 'Carol',
      hiredOn: '2026-07-01',
      email: 'admin@example.com',
      role: 'admin',
    })
    await createUser({ name: 'Bob', hiredOn: '2026-04-01' })
    await createUser({ name: 'Alice', hiredOn: '2026-04-01' })
    const token = await login('admin@example.com')

    const res = await client.api.admin.members.$get(undefined, withSession(token))

    assertStatus(res, 200)
    expect((await res.json()).map((m) => m.name)).toEqual(['Alice', 'Bob', 'Carol'])
  })
})
