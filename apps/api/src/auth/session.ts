import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { type PublicUser, publicUserColumns, sessions, users } from '../db/schema'

/**
 * セッション管理。
 *
 * 方式は「ランダムなトークンを Cookie に入れ、DB にはその SHA-256 だけを保存する」。
 * Lucia（現在は自前実装のための学習資料）が示している定石と同じ。
 */

export const SESSION_COOKIE = 'sid'

const DAY_MS = 24 * 60 * 60 * 1000
/** アイドル期限。アクセスがあれば延長される */
export const IDLE_TIMEOUT_MS = 7 * DAY_MS
/** 絶対期限。延長されない */
export const ABSOLUTE_TIMEOUT_MS = 30 * DAY_MS

/** 256 bit の乱数。推測は現実的に不可能 */
const generateToken = () => randomBytes(32).toString('base64url')

/**
 * トークンを DB に保存する形へ変換する。
 *
 * ハッシュで引くので、トークンの比較に定数時間比較は要らない。
 * 攻撃者はハッシュ値の先頭を狙って操作できないため、比較時間の差から情報を得られない。
 */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

type SessionMeta = { userAgent: string | null; ip: string | null }

/** 新しいセッションを発行する。返した token は Cookie にだけ入れ、どこにも保存しない */
export const createSession = async (userId: string, meta: SessionMeta) => {
  const token = generateToken()
  const now = Date.now()
  const expiresAt = new Date(now + IDLE_TIMEOUT_MS)

  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    absoluteExpiresAt: new Date(now + ABSOLUTE_TIMEOUT_MS),
    userAgent: meta.userAgent,
    ip: meta.ip,
  })

  return { token, expiresAt }
}

export type ValidatedSession = {
  user: PublicUser
  sessionId: string
  expiresAt: Date
  /** 期限を延長したか。延長したら Cookie の期限も付け直す必要がある */
  refreshed: boolean
}

/**
 * Cookie のトークンを検証する。無効なら null。
 *
 * - アイドル期限・絶対期限のどちらかを過ぎていたら、行を消して null
 * - 残りが半分を切っていたら延長する（ただし絶対期限は超えない）
 * - 半分以上残っていれば DB には書き込まない（読み取りだけの API で毎回書かないため）
 */
export const validateSessionToken = async (token: string): Promise<ValidatedSession | null> => {
  const sessionId = hashToken(token)

  const [row] = await db
    .select({
      expiresAt: sessions.expiresAt,
      absoluteExpiresAt: sessions.absoluteExpiresAt,
      user: publicUserColumns,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))

  if (!row) return null

  const now = Date.now()
  if (now >= row.expiresAt.getTime() || now >= row.absoluteExpiresAt.getTime()) {
    await invalidateSession(sessionId)
    return null
  }

  if (row.expiresAt.getTime() - now >= IDLE_TIMEOUT_MS / 2) {
    return { user: row.user, sessionId, expiresAt: row.expiresAt, refreshed: false }
  }

  const expiresAt = new Date(Math.min(now + IDLE_TIMEOUT_MS, row.absoluteExpiresAt.getTime()))
  await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, sessionId))

  return { user: row.user, sessionId, expiresAt, refreshed: true }
}

export const invalidateSession = async (sessionId: string) => {
  await db.delete(sessions).where(eq(sessions.id, sessionId))
}
