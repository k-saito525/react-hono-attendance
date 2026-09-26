import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Client, Pool } from 'pg'
import { assertTestDatabase, resolveTestDatabaseUrl } from './db-guard'

/**
 * テスト全体の開始時に1回だけ実行される。
 *
 * テスト用 DB を毎回ゼロから作り直し、マイグレーションを流す。
 * マイグレーションが毎回まっさらな DB に適用されるので、
 * 壊れたマイグレーションにはテストの時点で気づける。
 */
export default async function setup() {
  const url = resolveTestDatabaseUrl()
  const name = assertTestDatabase(url)

  // 接続中の DB 自身は DROP できないので、管理用の postgres DB に繋いで作り直す
  const maintenanceUrl = new URL(url)
  maintenanceUrl.pathname = '/postgres'

  const admin = new Client({ connectionString: maintenanceUrl.toString() })
  await admin.connect()
  try {
    // WITH (FORCE): 前回のテストが残した接続があっても切断して削除する
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    await admin.query(`CREATE DATABASE "${name}"`)
  } finally {
    await admin.end()
  }

  const pool = new Pool({ connectionString: url })
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
    })
  } finally {
    await pool.end()
  }
}
