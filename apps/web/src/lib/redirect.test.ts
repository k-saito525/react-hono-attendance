import { describe, expect, it } from 'vitest'
import { isSafeRedirect } from './redirect'

describe('isSafeRedirect（オープンリダイレクト対策）', () => {
  it.each(['/', '/admin/members', '/attendances?month=2026-09', '/attendances/2026-09-18#detail'])(
    '自サイト内のパスは許可する: %s',
    (value) => {
      expect(isSafeRedirect(value)).toBe(true)
    },
  )

  it.each([
    ['別サイトの URL', 'https://evil.example'],
    ['プロトコル相対 URL', '//evil.example'],
    ['バックスラッシュ（ブラウザは / とみなす）', '/\\evil.example'],
    ['javascript: スキーム', 'javascript:alert(1)'],
    ['相対パス', 'admin/members'],
    ['空文字', ''],
  ])('拒否する: %s', (_label, value) => {
    expect(isSafeRedirect(value)).toBe(false)
  })
})
