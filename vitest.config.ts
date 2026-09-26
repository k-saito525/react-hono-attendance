import { defineConfig } from 'vitest/config'

/**
 * モノレポ全体のテストを束ねる。
 *
 * 各パッケージの vitest.config.ts を「プロジェクト」として読み込み、
 * `pnpm test` 一発で全部を走らせる。環境（Node / jsdom）や DB の準備は
 * パッケージごとに違うので、中身の設定は各パッケージ側に置いている。
 */
export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*'],
  },
})
