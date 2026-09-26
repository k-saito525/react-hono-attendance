import { healthSchema } from '@attendance/shared'
import { serve } from '@hono/node-server'
import { asc } from 'drizzle-orm'
import { Hono } from 'hono'
import { closeDb, db } from './db/client'
import { users } from './db/schema'
import { env } from './env'

/**
 * ルートは必ずメソッドチェーンで定義すること。
 *
 * Hono の `.get()` は「そのルート情報を型に積んだ新しい型」を返す。
 *
 *   const app = new Hono()
 *   app.get('/api/health', handler)   // ✖ 戻り値を捨てると AppType に反映されない
 *
 * ルートが増えたら `.get().post()...` と繋ぐか、`app.route()` で合成する。
 */
const app = new Hono()
  .get('/api/health', (c) =>
    c.json(
      healthSchema.parse({
        status: 'ok',
        service: 'attendance-api',
        time: new Date().toISOString(),
      }),
    ),
  )
  .get('/api/users', async (c) => {
    /**
     * 列を明示して select する。
     * テーブル全体を返すと password_hash がレスポンスに載る。
     * 「除外し忘れ」は起きるが「含め忘れ」は気づくので、明示する側が安全。
     */
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        hiredOn: users.hiredOn,
      })
      .from(users)
      .orderBy(asc(users.hiredOn), asc(users.name))

    return c.json(rows)
  })

/** web 側が `hc<AppType>` でこの型を参照し、API の入出力型を受け取る。 */
export type AppType = typeof app

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`)
})

/** Ctrl+C で接続プールを閉じてから終了する */
const shutdown = () => {
  server.close(() => {
    void closeDb().finally(() => process.exit(0))
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

export default app
