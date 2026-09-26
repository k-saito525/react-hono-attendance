import { describe, expect, it } from 'vitest'
import { db } from '../src/db/client'
import { users } from '../src/db/schema'
import { env } from '../src/env'
import { assertTestDatabase } from './db-guard'
import { createUser } from './factories'

/**
 * テスト基盤そのものが期待どおりに動いていることを確かめるテスト。
 * アプリの機能ではなく「テストが信用できるか」を検証している。
 */

describe('assertTestDatabase（開発用 DB を消さないための安全装置）', () => {
  it('_test で終わる DB は通す', () => {
    expect(assertTestDatabase('postgres://u:p@localhost:5433/attendance_test')).toBe(
      'attendance_test',
    )
  })

  it('開発用 DB は拒否する', () => {
    expect(() => assertTestDatabase('postgres://u:p@localhost:5433/attendance')).toThrow(
      'テスト用ではない DB',
    )
  })

  it('識別子として不正な名前は拒否する', () => {
    expect(() => assertTestDatabase('postgres://u:p@localhost:5433/x%22%3B_test')).toThrow(
      '使えない文字',
    )
  })
})

describe('接続先', () => {
  it('アプリのコードが繋いでいる DB はテスト用', () => {
    expect(new URL(env.DATABASE_URL).pathname).toMatch(/_test$/)
  })
})

/**
 * 意図的に順序へ依存させている。
 * 1つ目で作ったデータが、2つ目の開始時には消えていることを示すため。
 * （通常のテストでは順序に依存させてはいけない）
 */
describe('テスト間の隔離', () => {
  it('1つ目: ユーザーを作る', async () => {
    await createUser()
    expect(await db.$count(users)).toBe(1)
  })

  it('2つ目: 前のテストで作ったユーザーは残っていない', async () => {
    expect(await db.$count(users)).toBe(0)
  })
})
