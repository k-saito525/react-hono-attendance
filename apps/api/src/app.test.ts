import { testClient } from 'hono/testing'
import { describe, expect, it } from 'vitest'
import app from './app'

/**
 * testClient は app.fetch を直接呼ぶので、サーバを起動せずに済む。
 * しかも web 側の hc と同じ型付きクライアントなので、
 * 存在しないルートや誤ったレスポンスの扱いはコンパイルエラーになる。
 */
const client = testClient(app)

describe('GET /api/health', () => {
  it('status: ok を返す', async () => {
    const res = await client.api.health.$get()

    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('ok')
  })
})

/**
 * フォーム形式のリクエストは、ブラウザがプリフライトなしで別サイトから送れる。
 * csrf() がそこを Origin で塞いでいることを確かめる。
 */
describe('CSRF 対策', () => {
  const postForm = (origin: string) =>
    app.request('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
    })

  it('別サイトからのフォーム送信は 403', async () => {
    expect((await postForm('https://evil.example')).status).toBe(403)
  })

  it('同じオリジンからのフォーム送信は通る', async () => {
    // app.request の既定のオリジンは http://localhost
    expect((await postForm('http://localhost')).status).toBe(204)
  })
})
