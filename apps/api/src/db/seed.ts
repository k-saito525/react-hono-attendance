import { hash } from '@node-rs/argon2'
import { inArray } from 'drizzle-orm'
import { closeDb, db } from './client'
import { users, workSchedules } from './schema'

/**
 * 開発用の初期データ。
 *
 * 何度実行しても同じ結果になるよう冪等にしている。
 * 開発中は繰り返し流すことになるため、2回目が落ちたり
 * 重複行が増えたりしては使い物にならない。
 */

/** 開発用の共通パスワード。本番の運用ではありえない扱いなので seed 限定 */
const SEED_PASSWORD = 'password123'

/**
 * admin を 2 人作っているのは意図的。
 *
 * 自己承認は禁止（requests.user_id === 承認者の id なら 403）なので、
 * admin が 1 人だとその人の申請を誰も承認できなくなる。
 * docs/spec.md の「認可」を参照。
 */
const seedUsers = [
  { email: 'sato@example.com', name: '佐藤 太郎', role: 'admin', hiredOn: '2026-04-01' },
  { email: 'tanaka@example.com', name: '田中 花子', role: 'admin', hiredOn: '2026-04-01' },
  { email: 'suzuki@example.com', name: '鈴木 次郎', role: 'employee', hiredOn: '2026-04-01' },
  { email: 'takahashi@example.com', name: '高橋 三郎', role: 'employee', hiredOn: '2026-07-01' },
] as const

const main = async () => {
  const passwordHash = await hash(SEED_PASSWORD)

  // onConflictDoNothing により、既にいるユーザーはそのまま残る
  await db
    .insert(users)
    .values(seedUsers.map((u) => ({ ...u, passwordHash })))
    .onConflictDoNothing()

  // 既存行は insert が何も返さないため、あらためて取り直す
  const created = await db
    .select()
    .from(users)
    .where(
      inArray(
        users.email,
        seedUsers.map((u) => u.email),
      ),
    )

  const admin = created.find((u) => u.role === 'admin')
  if (!admin) throw new Error('admin が見つかりません。seed のデータを確認してください。')

  /**
   * 全員に勤務体系を 1 行作る。
   *
   * effective_from は入社日にする。これにより getScheduleFor() が
   * 「値を返せない日」を持たなくなり、集計ロジックから
   * 「所定が不明なとき」の分岐を消せる。
   */
  await db
    .insert(workSchedules)
    .values(
      created.map((u) => ({
        userId: u.id,
        effectiveFrom: u.hiredOn,
        scheduledStart: '09:00:00',
        scheduledEnd: '18:00:00',
        createdBy: admin.id,
      })),
    )
    .onConflictDoNothing()

  const userCount = await db.$count(users)
  const scheduleCount = await db.$count(workSchedules)

  console.log(`seed 完了: users ${userCount} 件 / work_schedules ${scheduleCount} 件`)
  console.log(`ログイン用パスワード（開発専用）: ${SEED_PASSWORD}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => closeDb())
