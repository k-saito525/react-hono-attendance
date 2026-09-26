import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env } from '../env'
import * as schema from './schema'

/**
 * 接続プール。
 *
 * リクエストごとに接続を張ると、接続の確立コストが毎回かかるうえ
 * Postgres の max_connections をすぐ使い切る。
 * プールが接続を使い回し、空いたものを次のリクエストに渡す。
 */
const pool = new Pool({
  connectionString: env.DATABASE_URL,
})

export const db = drizzle(pool, { schema })

/** グレースフルシャットダウン時に接続を閉じる */
export const closeDb = () => pool.end()
