import { z } from 'zod'

/**
 * ログインの入力。
 *
 * API（Hono のバリデーション）と web（ログインフォームの検証）の両方がこの定義を使う。
 * 2か所に書くと、片方だけ直して「フォームは通るのに API が弾く」状態になるため。
 */
export const loginInputSchema = z.object({
  email: z.email('メールアドレスの形式が正しくありません'),
  password: z.string().min(1, 'パスワードを入力してください'),
})

export type LoginInput = z.infer<typeof loginInputSchema>
