// toBeInTheDocument() などの DOM 向けマッチャーを expect に追加する
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server'

beforeAll(() => {
  /**
   * ハンドラを用意していないリクエストはテストを失敗させる。
   * 黙って素通りさせると、「モックしたつもりの API を実は呼んでいない」ことに気づけない。
   * （MSW v3 で onUnhandledRequest から onUnhandledFrame に改名された）
   */
  server.listen({ onUnhandledFrame: 'error' })
})

afterEach(() => {
  // 描画した DOM をテストごとに片付ける。
  // Vitest の globals を無効にしているので、Testing Library の自動片付けは効かない
  cleanup()
  // テストの中で server.use() したハンドラを外す
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
