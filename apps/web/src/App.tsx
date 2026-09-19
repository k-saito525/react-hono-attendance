import type { Health } from '@attendance/shared'
import { useEffect, useState } from 'react'
import { client } from './lib/api'

export function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await client.api.health.$get()

        // data の型は API の定義から推論される。手で型注釈を書いていないのに
        // Health として扱えるのが、Hono RPC による型共有が効いている証拠。
        const data = await res.json()

        if (!cancelled) setHealth(data)
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
        maxWidth: '40rem',
        margin: '4rem auto',
        padding: '0 1rem',
        lineHeight: 1.7,
      }}
    >
      <h1 style={{ fontSize: '1.25rem' }}>勤怠管理アプリ</h1>
      <p style={{ color: '#666' }}>STEP 01 — web と api の疎通確認</p>

      {error && <p style={{ color: '#c00' }}>API への接続に失敗しました: {error}</p>}

      {!error && !health && <p style={{ color: '#666' }}>読み込み中…</p>}

      {health && (
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '0.25rem 1.5rem',
            border: '1px solid #ddd',
            borderRadius: '0.5rem',
            padding: '1rem 1.25rem',
          }}
        >
          <dt style={{ color: '#666' }}>status</dt>
          <dd style={{ margin: 0 }}>{health.status}</dd>
          <dt style={{ color: '#666' }}>service</dt>
          <dd style={{ margin: 0 }}>{health.service}</dd>
          <dt style={{ color: '#666' }}>time</dt>
          <dd style={{ margin: 0 }}>{health.time}</dd>
        </dl>
      )}
    </main>
  )
}
