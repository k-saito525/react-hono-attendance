import type { Role } from '@attendance/shared'
import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { SESSION_COOKIE, validateSessionToken } from '../auth/session'
import type { PublicUser } from '../db/schema'
import { env } from '../env'

/** 認証済みのハンドラから c.var.user / c.var.sessionId を型付きで読めるようにする */
export type AuthEnv = {
  Variables: {
    user: PublicUser
    sessionId: string
  }
}

/**
 * Cookie の属性。
 *
 * - HttpOnly: JavaScript から読めない。XSS があってもトークンを盗まれにくい
 * - SameSite=Lax: 別サイトからの POST に Cookie を付けない（CSRF 対策の土台）
 * - Secure: HTTPS でのみ送る。http://localhost で開発するため本番のみ
 */
const cookieOptions = () =>
  ({
    httpOnly: true,
    sameSite: 'Lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
  }) as const

export const setSessionCookie = (c: Context, token: string, expires: Date) => {
  setCookie(c, SESSION_COOKIE, token, { ...cookieOptions(), expires })
}

export const clearSessionCookie = (c: Context) => {
  deleteCookie(c, SESSION_COOKIE, cookieOptions())
}

/** 取れなければ null。テスト（testClient）には実際の接続がないため取れない */
export const getClientIp = (c: Context): string | null => {
  try {
    return getConnInfo(c).remote.address ?? null
  } catch {
    return null
  }
}

const UNAUTHORIZED = 'ログインが必要です'

/**
 * ログインしていなければ 401。
 * ログイン済みなら c.var.user に本人の情報を入れ、期限を延長したら Cookie も付け直す。
 */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return c.json({ message: UNAUTHORIZED }, 401)

  const session = await validateSessionToken(token)
  if (!session) {
    // 無効な Cookie をブラウザに残しておく理由はない
    clearSessionCookie(c)
    return c.json({ message: UNAUTHORIZED }, 401)
  }

  if (session.refreshed) setSessionCookie(c, token, session.expiresAt)

  c.set('user', session.user)
  c.set('sessionId', session.sessionId)
  await next()
})

/**
 * 指定した権限がなければ 403。requireAuth の後ろに置く。
 * role は「権限の追加」なので、admin も一般社員と同じルートを使える。
 */
export const requireRole = (role: Role) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    // requireAuth を付け忘れたときに、黙って通さず 401 にする
    if (!c.var.user) return c.json({ message: UNAUTHORIZED }, 401)
    if (c.var.user.role !== role) return c.json({ message: '権限がありません' }, 403)
    await next()
  })
