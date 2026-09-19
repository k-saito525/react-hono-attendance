import { healthSchema } from '@attendance/shared'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'

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
const app = new Hono().get('/api/health', (c) =>
  c.json(
    healthSchema.parse({
      status: 'ok',
      service: 'attendance-api',
      time: new Date().toISOString(),
    }),
  ),
)

/** web 側が `hc<AppType>` でこの型を参照し、API の入出力型を受け取る。 */
export type AppType = typeof app

const port = Number(process.env.PORT ?? 3000)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`)
})

export default app
