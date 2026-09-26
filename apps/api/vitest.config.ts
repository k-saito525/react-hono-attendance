import { defineConfig } from 'vitest/config'
// 設定ファイルは Vite が直接読み込むため、拡張子まで書く（Vite のネイティブ読み込みの要件）
import { resolveTestDatabaseUrl } from './test/db-guard.ts'

export default defineConfig({
  test: {
    name: 'api',
    environment: 'node',

    // テスト全体の開始時に1回: テスト用 DB を作り直してマイグレーション
    globalSetup: ['./test/global-setup.ts'],
    // 各テストファイルの前: 接続先の確認と、テストごとの TRUNCATE
    setupFiles: ['./test/setup.ts'],

    // アプリのコード（src/env.ts）が読む DATABASE_URL をテスト用に差し替える。
    // env.ts の loadEnvFile() は既存の環境変数を上書きしないので、ここで入れた値が勝つ。
    env: {
      DATABASE_URL: resolveTestDatabaseUrl(),
    },

    // 全テストが同じ DB を TRUNCATE し合うため、ファイル間で並列に走らせない
    fileParallelism: false,
  },
})
