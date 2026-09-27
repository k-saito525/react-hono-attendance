import { loginInputSchema } from '@attendance/shared'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { verifyPassword } from '../auth/password'
import { createSession, hashToken, invalidateSession, SESSION_COOKIE } from '../auth/session'
import { db } from '../db/client'
import { publicUserColumns, users } from '../db/schema'
import { validate } from '../lib/validator'
import {
  type AuthEnv,
  clearSessionCookie,
  getClientIp,
  requireAuth,
  setSessionCookie,
} from '../middleware/auth'

/**
 * パスワード違いと「そのメールは存在しない」を区別しない。
 * 分けると、他人のメールアドレスが登録済みかどうかを調べられてしまう。
 */
const INVALID_CREDENTIALS = 'メールアドレスまたはパスワードが正しくありません'

export const authRoutes = new Hono<AuthEnv>()
  .post('/login', validate('json', loginInputSchema), async (c) => {
    const { email, password } = c.req.valid('json')

    const [found] = await db
      .select({ ...publicUserColumns, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email))

    // ユーザーがいなくても照合は走らせる（応答時間でメールの存在が分からないように）
    const ok = await verifyPassword(found?.passwordHash ?? null, password)
    if (!found || !ok) return c.json({ message: INVALID_CREDENTIALS }, 401)

    /**
     * ログインのたびに新しいトークンを発行する（セッション固定攻撃への対策）。
     * ログイン前から持っていた Cookie のセッションは使い回さず、ここで破棄する。
     */
    const previous = getCookie(c, SESSION_COOKIE)
    if (previous) await invalidateSession(hashToken(previous))

    const { token, expiresAt } = await createSession(found.id, {
      userAgent: c.req.header('User-Agent') ?? null,
      ip: getClientIp(c),
    })
    setSessionCookie(c, token, expiresAt)

    const { passwordHash: _passwordHash, ...user } = found
    return c.json({ user }, 200)
  })

  .post('/logout', async (c) => {
    // セッションが既に無効でも成功扱いにする（ログアウトしたい、という目的は満たされている）
    const token = getCookie(c, SESSION_COOKIE)
    if (token) await invalidateSession(hashToken(token))
    clearSessionCookie(c)
    return c.body(null, 204)
  })

  .get('/me', requireAuth, (c) => c.json({ user: c.var.user }, 200))
