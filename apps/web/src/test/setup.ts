// toBeInTheDocument() などの DOM 向けマッチャーを expect に追加する
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  // 描画した DOM をテストごとに片付ける。
  // Vitest の globals を無効にしているので、Testing Library の自動片付けは効かない
  cleanup()
  // vi.stubGlobal で差し替えた fetch などを元に戻す
  vi.unstubAllGlobals()
})
