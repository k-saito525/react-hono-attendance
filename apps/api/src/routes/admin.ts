import { asc } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../db/client'
import { publicUserColumns, users } from '../db/schema'
import { type AuthEnv, requireAuth, requireRole } from '../middleware/auth'

/**
 * 管理者向けの API。ここに置くルートはすべて admin 限定になる。
 * 未ログインは 401、employee は 403。
 */
export const adminRoutes = new Hono<AuthEnv>()
  .use(requireAuth, requireRole('admin'))

  .get('/members', async (c) => {
    const members = await db
      .select(publicUserColumns)
      .from(users)
      .orderBy(asc(users.hiredOn), asc(users.name))

    return c.json(members, 200)
  })
