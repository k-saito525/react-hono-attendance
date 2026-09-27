import type { Role } from '@attendance/shared'
import { desc, sql } from 'drizzle-orm'
import {
  check,
  customType,
  date,
  index,
  inet,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * 大文字小文字を区別しない文字列型。Postgres の citext 拡張を使う。
 *
 * email に使うことで Taro@example.com と taro@example.com を同一視できる。
 * 拡張は Drizzle が自動で作れないため、マイグレーション SQL に
 * CREATE EXTENSION を手で足している。
 */
const citext = customType<{ data: string }>({
  dataType: () => 'citext',
})

/**
 * 主キーの既定値。UUID v7 を使う。
 *
 * 連番を避けるのは、ID が URL に出るため（/admin/members/:id）。
 * 連番だと ID から登録件数が推測できてしまう。
 *
 * v4（gen_random_uuid）ではなく v7 にするのは、v7 が時刻順で単調増加するため。
 * v4 はランダムなので B-tree の挿入位置が散らばり、ページ分割が増える。
 * v7 なら挿入が末尾に集中する。
 *
 * uuidv7() は Postgres 18 以降の組み込み関数。拡張は不要。
 */
const uuidv7 = sql`uuidv7()`

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(uuidv7),
    email: citext('email').notNull().unique(),
    /** argon2id でハッシュ化したパスワード。平文は保存しない */
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    /**
     * enum 型ではなく text + CHECK 制約にしている。
     * Postgres の enum は値の追加・削除にマイグレーションが必要で扱いが硬い。
     * TS 側は $type<Role>() で union 型として扱えるので、型安全性は保てる。
     */
    role: text('role').$type<Role>().notNull(),
    /** 入社日。初回の勤務体系の適用開始日になる */
    hiredOn: date('hired_on').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('users_role_check', sql`${t.role} in ('employee', 'admin')`)],
)

/**
 * 勤務体系の適用履歴。
 *
 * 所定労働時間は「現在の値」ではなく「その日に適用されていた値」を引く。
 * 現在値を1つだけ持つ設計だと、管理画面から変更した瞬間に
 * 過去の勤怠の集計が書き換わってしまう。
 * docs/spec.md の「所定労働時間」を参照。
 */
export const workSchedules = pgTable(
  'work_schedules',
  {
    id: uuid('id').primaryKey().default(uuidv7),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** この日から適用。未来日を入れれば「11/1 から適用」の予約になる */
    effectiveFrom: date('effective_from').notNull(),
    scheduledStart: time('scheduled_start').notNull(),
    scheduledEnd: time('scheduled_end').notNull(),
    /** 設定した管理者。誰が変えたかを追えるようにする */
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // 同じユーザーの同じ適用開始日は1行だけ
    unique('work_schedules_user_effective_unique').on(t.userId, t.effectiveFrom),
    // getScheduleFor() は「effective_from <= 対象日 の最新1行」を引く。
    // DESC を含めることでソートなしで先頭が取れる。
    index('work_schedules_user_effective_idx').on(t.userId, desc(t.effectiveFrom)),
  ],
)

/**
 * ログインセッション。
 *
 * id は Cookie に入れたトークンそのものではなく、その SHA-256。
 * DB が漏れても、ここからログイン中のセッションを乗っ取れないようにするため。
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** アイドル期限。アクセスがあれば延長される */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** 絶対期限。延長されない。超えたら再ログイン */
    absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
    userAgent: text('user_agent'),
    /** 取得できた場合のみ。開発時は Vite の proxy 経由なので 127.0.0.1 になる */
    ip: inet('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // 「このユーザーのセッションをすべて破棄する」（パスワード変更時など）ための索引
  (t) => [index('sessions_user_id_idx').on(t.userId)],
)

/**
 * API が外に返してよいユーザーの項目。
 *
 * /api/auth/me と /api/admin/members の両方がこれを使う。
 * 返す項目の定義を1か所にまとめ、password_hash の混入を構造的に防ぐ。
 * 項目を増やすときは、テストの許可リストも意図して更新すること。
 */
export const publicUserColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  hiredOn: users.hiredOn,
}

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type WorkSchedule = typeof workSchedules.$inferSelect
export type NewWorkSchedule = typeof workSchedules.$inferInsert
export type Session = typeof sessions.$inferSelect
export type PublicUser = Pick<User, keyof typeof publicUserColumns>
