import { healthSchema } from '@attendance/shared'
import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'

/**
 * アプリの定義。サーバの起動（serve）は index.ts が担当する。
 *
 * 分けているのは、テストと web がこのファイルを import するため。
 * 定義と起動が同じファイルにあると、import しただけでサーバが立ち上がり、
 * テストが 3000 番ポートを掴んでしまう。
 *
 * ルートは必ずメソッドチェーンで定義すること。
 * Hono の `.get()` や `.route()` は「ルート情報を型に積んだ新しい型」を返すので、
 * 戻り値を捨てると AppType に反映されず、web 側から見えなくなる。
 */
const app = new Hono()
  /**
   * フォーム形式のリクエスト（application/x-www-form-urlencoded など）に対して、
   * Origin / Sec-Fetch-Site が自分自身かを確認する。
   *
   * JSON のリクエストは、別サイトから送るとブラウザがプリフライトを挟むので元々守られている。
   * 穴になるのはプリフライトなしで送れるフォーム形式だけで、csrf() はそこを塞ぐ。
   * SameSite=Lax の Cookie と合わせた多層防御。
   */
  .use('/api/*', csrf())

  .get('/api/health', (c) =>
    c.json(
      healthSchema.parse({
        status: 'ok',
        service: 'attendance-api',
        time: new Date().toISOString(),
      }),
    ),
  )
  .route('/api/auth', authRoutes)
  .route('/api/admin', adminRoutes)

/**
 * 想定外のエラーは 500 にし、内部の情報（スタックトレースなど）を返さない。
 * HTTPException（csrf() の 403 など）は、意図したステータスのまま返す。
 */
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  console.error(err)
  return c.json({ message: 'サーバーでエラーが発生しました' }, 500)
})

/** web 側が `hc<AppType>` でこの型を参照し、API の入出力型を受け取る。 */
export type AppType = typeof app

export default app
