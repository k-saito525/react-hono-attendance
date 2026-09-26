import { fileURLToPath } from 'node:url'

/**
 * テストが開発用 DB を壊さないための安全装置。
 *
 * テストは開始時に DB を作り直し、各テストの前にテーブルを空にする。
 * 接続先を間違えると開発データが消えるが、.claude/hooks/guard-bash.sh は
 * Claude が打つコマンドしか見ておらず、`pnpm test` の中で実行される SQL は防げない。
 * そこで、接続先の DB 名が `_test` で終わらなければ処理そのものを拒否する。
 */
export const assertTestDatabase = (url: string): string => {
  const name = new URL(url).pathname.replace(/^\//, '')

  // DROP DATABASE "<name>" に埋め込むので、識別子として安全な文字だけを許す
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error(`DB 名に使えない文字が含まれています: "${name}"`)
  }
  if (!name.endsWith('_test')) {
    throw new Error(
      `テスト用ではない DB に接続しようとしています: "${name}"\n` +
        'テストは DB を作り直すため、名前が _test で終わる DB にしか接続しません。\n' +
        '.env の TEST_DATABASE_URL を確認してください。',
    )
  }
  return name
}

/**
 * テスト用 DB の接続先を決める。
 *
 * ローカルではリポジトリルートの .env から、CI では環境変数から読む。
 */
export const resolveTestDatabaseUrl = (): string => {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)))
  } catch {
    // .env が無い環境（CI）では既存の process.env をそのまま使う
  }

  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    throw new Error('TEST_DATABASE_URL が設定されていません。.env.example を参照してください。')
  }
  assertTestDatabase(url)
  return url
}
