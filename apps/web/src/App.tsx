import { useEffect, useState } from 'react'
import { client } from './lib/api'

/** API のレスポンスから型を借りる。web 側で型を再定義しない */
type User = Awaited<ReturnType<Awaited<ReturnType<typeof client.api.users.$get>>['json']>>[number]

export function App() {
  const [users, setUsers] = useState<User[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await client.api.users.$get()
        const data = await res.json()
        if (!cancelled) setUsers(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
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
      <p style={{ color: '#666' }}>STEP 02 — DB に入れた seed データの表示</p>

      {error && <p style={{ color: '#c00' }}>API への接続に失敗しました: {error}</p>}
      {!error && !users && <p style={{ color: '#666' }}>読み込み中…</p>}

      {users && (
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
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem 0.75rem' }}>{u.name}</td>
                <td style={{ padding: '0.5rem 0.75rem', color: '#666' }}>{u.email}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.1rem 0.5rem',
                      borderRadius: '999px',
                      background: u.role === 'admin' ? '#e8f0fe' : '#f1f3f4',
                      color: u.role === 'admin' ? '#1a5fb4' : '#5f6368',
                    }}
                  >
                    {u.role}
                  </span>
                </td>
                <td style={{ padding: '0.5rem 0.75rem', color: '#666' }}>{u.hiredOn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
