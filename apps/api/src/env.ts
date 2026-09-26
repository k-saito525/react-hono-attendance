import { fileURLToPath } from 'node:url'
import { z } from 'zod'

/**
 * リポジトリルートの .env を読み込む。
 *
 * dotenv は入れず Node 標準の loadEnvFile を使う（依存を1つ減らせる）。
 * CI では環境変数が直接渡るため、ファイルが無くても失敗させない。
 */
try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)))
} catch {
  // .env が無い環境（CI など）では既存の process.env をそのまま使う
}

/**
 * 環境変数は起動時に検証する。
 * DB 接続の瞬間まで設定漏れに気づけないのを避けるため。
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL が設定されていません'),
  PORT: z.coerce.number().int().positive().default(3000),
})

export const env = envSchema.parse(process.env)
