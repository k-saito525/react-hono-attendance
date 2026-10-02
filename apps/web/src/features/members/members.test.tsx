import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { admin, employee, meHandler, membersHandler } from '../../test/handlers'
import { renderApp } from '../../test/render'
import { server } from '../../test/server'

describe('メンバー一覧（/admin/members）', () => {
  it('admin なら一覧を表示する', async () => {
    server.use(meHandler(admin), membersHandler([admin, employee]))

    renderApp('/admin/members')

    const table = await screen.findByRole('table')
    expect(within(table).getByText('佐藤 太郎')).toBeInTheDocument()
    expect(within(table).getByText('鈴木 次郎')).toBeInTheDocument()
    expect(within(table).getByText('管理者')).toBeInTheDocument()
    expect(within(table).getByText('一般')).toBeInTheDocument()
  })

  it('employee が開くと「権限がありません」を表示し、API は呼ばない', async () => {
    // members のハンドラを用意していない。呼べば onUnhandledFrame: 'error' でテストが落ちる
    server.use(meHandler(employee))

    renderApp('/admin/members')

    expect(await screen.findByRole('heading', { name: '権限がありません' })).toBeInTheDocument()
  })

  it('API が 403 を返した場合も「権限がありません」を表示する（表示中に権限が外された場合など）', async () => {
    server.use(meHandler(admin), membersHandler(403))

    renderApp('/admin/members')

    expect(await screen.findByRole('heading', { name: '権限がありません' })).toBeInTheDocument()
  })

  it('メンバーへのリンクは admin にだけ表示する', async () => {
    server.use(meHandler(employee))

    renderApp('/')

    expect(await screen.findByText('鈴木 次郎 さん、こんにちは')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'メンバー' })).not.toBeInTheDocument()
  })
})
