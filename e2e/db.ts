import { fileURLToPath } from 'node:url'

/**
 * E2E 用 DB の接続先を決め、安全装置をかける。
 *
 * E2E は開始時に DB を作り直す。接続先を間違えると開発データが消えるので、
 * DB 名が `_e2e` で終わらなければ起動そのものを拒否する（api のテストの `_test` ガードと同じ考え方）。
 * テスト用（_test）とも名前を分けているのは、api のテストと E2E を同時に流しても
 * 互いの DB を作り直し合わないようにするため。
 */
export const resolveE2EDatabaseUrl = (): string => {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)))
  } catch {
    // .env が無い環境（CI）では既存の環境変数を使う
  }

  const url = process.env.E2E_DATABASE_URL
  if (!url)
    throw new Error('E2E_DATABASE_URL が設定されていません。.env.example を参照してください。')

  assertE2EDatabase(url)
  return url
}

export const assertE2EDatabase = (url: string): string => {
  const name = new URL(url).pathname.replace(/^\//, '')

  // DROP DATABASE "<name>" に埋め込むので、識別子として安全な文字だけを許す
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`DB 名に使えない文字が含まれています: "${name}"`)
  if (!name.endsWith('_e2e')) {
    throw new Error(
      `E2E 用ではない DB に接続しようとしています: "${name}"\n` +
        'E2E は DB を作り直すため、名前が _e2e で終わる DB にしか接続しません。',
    )
  }
  return name
}
