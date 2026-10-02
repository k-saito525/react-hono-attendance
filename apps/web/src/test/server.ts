import { setupServer } from 'msw/node'

/**
 * テスト用の API モックサーバ。
 * 既定のハンドラは持たせず、各テストが server.use(...) で必要なものだけを足す。
 * 何を前提にしたテストなのかを、テスト本文から読めるようにするため。
 */
export const server = setupServer()
