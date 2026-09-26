import { defineConfig } from 'drizzle-kit'
import { env } from './src/env'

/**
 * Drizzle Kit の設定。
 *
 * schema.ts（TypeScript）を単一の正とし、SQL は generate で生成する。
 * 生成された SQL も drizzle/ 配下にコミットするので、
 * 適用される DDL を必ずレビューできる。
 *
 *   pnpm -F @attendance/api db:generate   schema.ts の差分から SQL を生成
 *   pnpm -F @attendance/api db:migrate    未適用の SQL を DB へ適用
 *
 * push（スキーマを DB へ直接反映）は使わない。履歴が残らず、
 * 本番相当の運用を学ぶ目的から外れるため。
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  casing: 'snake_case',
})
