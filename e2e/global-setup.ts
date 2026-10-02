import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { assertE2EDatabase, resolveE2EDatabaseUrl } from './db'

/**
 * E2E の開始時に1回だけ実行される。
 * E2E 用 DB をゼロから作り直し、マイグレーションと seed を流す。
 *
 * マイグレーションと seed は api 側のスクリプトをそのまま呼ぶ。
 * 開発時に使っている手順と同じものを通すことで、その手順自体も E2E で検証される。
 */
export default async function globalSetup() {
  const url = resolveE2EDatabaseUrl()
  const name = assertE2EDatabase(url)

  // 接続中の DB 自身は DROP できないので、管理用の postgres DB に繋いで作り直す
  const maintenanceUrl = new URL(url)
  maintenanceUrl.pathname = '/postgres'
  const admin = new Client({ connectionString: maintenanceUrl.toString() })
  await admin.connect()
  try {
    // WITH (FORCE): 起動済みの API が接続していても切断して削除する
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    await admin.query(`CREATE DATABASE "${name}"`)
  } finally {
    await admin.end()
  }

  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  // api の env.ts は既存の環境変数を上書きしないので、ここで渡した DATABASE_URL が使われる
  const env = { ...process.env, DATABASE_URL: url }
  for (const script of ['db:migrate', 'db:seed']) {
    execFileSync('pnpm', ['-F', '@attendance/api', script], { cwd: repoRoot, env, stdio: 'pipe' })
  }
}
