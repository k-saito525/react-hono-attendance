import { healthSchema } from '@attendance/shared'
import { asc } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from './db/client'
import { users } from './db/schema'

/**
 * アプリの定義。サーバの起動（serve）は index.ts が担当する。
 *
 * 分けているのは、テストと web がこのファイルを import するため。
 * 定義と起動が同じファイルにあると、import しただけでサーバが立ち上がり、
 * テストが 3000 番ポートを掴んでしまう。
 *
 * ルートは必ずメソッドチェーンで定義すること。
 * Hono の `.get()` は「そのルート情報を型に積んだ新しい型」を返すので、
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
     * 「除外し忘れ」は気づけないが「含め忘れ」は気づけるので、明示する側が安全。
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

export default app
