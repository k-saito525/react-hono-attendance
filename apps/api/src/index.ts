import { serve } from '@hono/node-server'
import app from './app'
import { closeDb } from './db/client'
import { env } from './env'

/**
 * サーバの起動だけを担当する。アプリの定義は app.ts。
 */
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
