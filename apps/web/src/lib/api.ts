import type { AppType } from '@attendance/api'
import { hc } from 'hono/client'

/**
 * API クライアント。
 *
 * ベース URL が '/' なのは、Vite の proxy が /api を API サーバへ転送しており、
 * web から見ると同一オリジンになっているため。
 *
 * AppType は必ず `import type` で読むこと。値として import すると
 * API 側のコードが web のバンドルに混入する。
 * tsconfig.base.json の verbatimModuleSyntax がこれを型チェックで強制している。
 */
export const client = hc<AppType>('/')
