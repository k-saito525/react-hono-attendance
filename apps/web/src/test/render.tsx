import { createMemoryHistory } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, createApp } from '../app'

/**
 * アプリ全体を、指定した URL から描画する。
 *
 * 部品単体ではなくルーター・認証ガード・QueryClient まで含めて描画するのは、
 * 「未ログインならログイン画面へ」のような画面をまたぐ振る舞いを確かめたいため。
 * 本番と同じ createApp() を使い、履歴だけをメモリ上のものに差し替える。
 */
export const renderApp = (path: string) => {
  const app = createApp({ history: createMemoryHistory({ initialEntries: [path] }) })
  const user = userEvent.setup()
  render(<App {...app} />)
  return { ...app, user }
}
