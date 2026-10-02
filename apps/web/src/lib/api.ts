import type { AppType } from '@attendance/api'
import { DetailedError, hc } from 'hono/client'

/**
 * API クライアント。
 *
 * 接続先は自分自身のオリジン。開発時は Vite の proxy が /api を API サーバへ転送するので、
 * ブラウザから見ると web と API は同一オリジンになる（docs/spec.md「オリジン方針」）。
 * '/' ではなく origin を渡しているのは、テスト環境（Node の fetch）が相対 URL を解決できないため。
 *
 * AppType は必ず `import type` で読むこと。値として import すると
 * API 側のコードが web のバンドルに混入する（verbatimModuleSyntax が型チェックで防いでいる）。
 */
export const client = hc<AppType>(window.location.origin)

/**
 * API 呼び出しは hono/client の parseResponse で包む。
 *   - 2xx なら、パース済みの本文を（ルート定義どおりの型で）返す
 *   - それ以外なら、statusCode と本文を持った DetailedError を投げる
 *
 * 認可ミドルウェアが返す 401 / 403 は RPC の型に現れないが、
 * こうしておけば「2xx 以外は例外」という1つの扱いに揃う。
 */
export { parseResponse } from 'hono/client'

/** API がエラーを返したか（status を指定すればそのステータスか）を判定する */
export const isHttpError = (error: unknown, status?: number): error is DetailedError =>
  error instanceof DetailedError && (status === undefined || error.statusCode === status)

/** API のエラー本文（{ message, errors? }）を取り出す */
export const errorBody = <T = { message?: string }>(error: DetailedError): T | undefined =>
  error.detail?.data as T | undefined
