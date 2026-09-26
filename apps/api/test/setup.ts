import { sql } from 'drizzle-orm'
import { afterAll, beforeEach } from 'vitest'
import { closeDb, db } from '../src/db/client'
import { env } from '../src/env'
import { assertTestDatabase } from './db-guard'

/**
 * 各テストファイルの開始前に実行される。
 *
 * global-setup.ts が作り直すのは TEST_DATABASE_URL の DB だが、
 * ここで TRUNCATE するのは「アプリの db クライアントが実際に繋いでいる DB」。
 * 両者は別の経路で決まるため、こちらでもあらためて確認する。
 * 差し替えに失敗していれば、ここで止まって開発用 DB は無傷で済む。
 */
assertTestDatabase(env.DATABASE_URL)

/**
 * 各テストの前に public スキーマの全テーブルを空にする。
 *
 * テーブル名を列挙せずカタログから引いているのは、
 * テーブルが増えたときに書き足し忘れて「前のテストのデータが残る」のを防ぐため。
 * drizzle のマイグレーション履歴は drizzle スキーマにあるので対象外になる。
 */
beforeEach(async () => {
  const { rows } = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  )
  if (rows.length === 0) return

  const tables = rows.map((r) => `"${r.tablename}"`).join(', ')
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`))
})

afterAll(async () => {
  await closeDb()
})
