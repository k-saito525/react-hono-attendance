/**
 * ログイン後の戻り先として安全か（自サイト内のパスか）を判定する。
 *
 * ?redirect= の値をそのまま使うと、
 *   /login?redirect=https://evil.example
 * のような URL を配られたとき、ログインした直後に偽サイトへ飛ばされる（オープンリダイレクト）。
 * 正規のログイン画面を経由するので、利用者は偽サイトを信用してしまう。
 *
 * 文字列の先頭を見るだけでは `//evil.example` や `/\evil.example` を見落とすので、
 * ブラウザと同じ規則（WHATWG URL）で解釈し、オリジンが変わらないことを確かめる。
 */
export const isSafeRedirect = (value: string): boolean => {
  if (!value.startsWith('/')) return false
  try {
    const base = 'https://app.invalid'
    return new URL(value, base).origin === base
  } catch {
    return false
  }
}
