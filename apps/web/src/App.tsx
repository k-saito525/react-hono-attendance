import type { InferResponseType } from 'hono/client'
import { useEffect, useState } from 'react'
import { client } from './lib/api'

/** API のレスポンスから型を借りる。web 側で型を再定義しない */
type Member = InferResponseType<typeof client.api.admin.members.$get, 200>[number]

type State =
  | { kind: 'loading' }
  | { kind: 'loaded'; members: Member[] }
  | { kind: 'error'; message: string }

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await client.api.admin.members.$get()

        /**
         * requireAuth / requireRole が返す 401・403 は、RPC の型には現れない
         * （型に出るのはハンドラが返す 200 だけ）。
         * 型を信じて 200 だけを想定すると、未ログインのときに画面が壊れる。
         */
        const status: number = res.status
        if (status === 401)
          throw new Error('ログインが必要です（ログイン画面は STEP 05 で作ります）')
        if (status === 403) throw new Error('管理者のみ閲覧できます')
        if (!res.ok) throw new Error(`API がエラーを返しました（${status}）`)

        const members = await res.json()
        if (!cancelled) setState({ kind: 'loaded', members })
      } catch (e) {
        if (!cancelled) {
          setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: '48rem',
        margin: '4rem auto',
        padding: '0 1rem',
        lineHeight: 1.7,
      }}
    >
      <h1 style={{ fontSize: '1.25rem' }}>勤怠管理アプリ</h1>
      <p style={{ color: '#666' }}>メンバー一覧（管理者のみ）</p>

      {state.kind === 'loading' && <p style={{ color: '#666' }}>読み込み中…</p>}
      {state.kind === 'error' && <p style={{ color: '#c00' }}>{state.message}</p>}

      {state.kind === 'loaded' && (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem 0.75rem' }}>名前</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>メール</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>権限</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>入社日</th>
            </tr>
          </thead>
          <tbody>
            {state.members.map((m) => (
              <tr key={m.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem 0.75rem' }}>{m.name}</td>
                <td style={{ padding: '0.5rem 0.75rem', color: '#666' }}>{m.email}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.1rem 0.5rem',
                      borderRadius: '999px',
                      background: m.role === 'admin' ? '#e8f0fe' : '#f1f3f4',
                      color: m.role === 'admin' ? '#1a5fb4' : '#5f6368',
                    }}
                  >
                    {m.role}
                  </span>
                </td>
                <td style={{ padding: '0.5rem 0.75rem', color: '#666' }}>{m.hiredOn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
