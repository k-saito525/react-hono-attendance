import type { Role } from '@attendance/shared'
import { hash } from '@node-rs/argon2'
import { db } from '../src/db/client'
import { type User, users, workSchedules } from '../src/db/schema'

/**
 * テストデータの生成。
 *
 * テストごとに「そのテストに必要なデータだけ」を作る。
 * seed を流用しないのは、seed の中身が変わったときに無関係なテストが壊れるため。
 */

/** argon2 は意図的に遅いので、ハッシュは1回だけ計算して使い回す */
let passwordHash: Promise<string> | undefined
const getPasswordHash = () => {
  passwordHash ??= hash('password123')
  return passwordHash
}

let sequence = 0

type UserOverrides = Partial<{
  name: string
  email: string
  role: Role
  hiredOn: string
}>

/**
 * ユーザーを1人作る。
 *
 * 勤務体系も必ず1行作る。本番では「ユーザーには常に適用中の勤務体系がある」
 * という前提で集計ロジックを書くので、テストデータもその前提を守る。
 */
export const createUser = async (overrides: UserOverrides = {}): Promise<User> => {
  sequence += 1

  const [user] = await db
    .insert(users)
    .values({
      name: `テストユーザー${sequence}`,
      email: `user${sequence}@example.com`,
      role: 'employee',
      hiredOn: '2026-04-01',
      passwordHash: await getPasswordHash(),
      ...overrides,
    })
    .returning()

  if (!user) throw new Error('ユーザーの作成に失敗しました')

  await db.insert(workSchedules).values({
    userId: user.id,
    effectiveFrom: user.hiredOn,
    scheduledStart: '09:00:00',
    scheduledEnd: '18:00:00',
    createdBy: user.id,
  })

  return user
}
