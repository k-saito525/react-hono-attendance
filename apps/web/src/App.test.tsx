import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('API から取得したユーザーを一覧表示する', async () => {
    /**
     * fetch を手で差し替えている。STEP 05 で MSW に置き換える前提の暫定措置。
     * この方式だと URL やメソッドを区別できず、画面が増えるほど破綻する。
     */
    const fetchMock = vi.fn(async () =>
      Response.json([
        {
          id: '1',
          name: '佐藤 太郎',
          email: 'sato@example.com',
          role: 'admin',
          hiredOn: '2026-04-01',
        },
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(screen.getByText('読み込み中…')).toBeInTheDocument()
    expect(await screen.findByText('佐藤 太郎')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
