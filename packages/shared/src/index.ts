import { z } from 'zod'

/**
 * 疎通確認用のスキーマ。
 *
 * api（レスポンスの組み立て）と web（受け取った値の検証）の両方から
 * 同じ定義を参照できることを確かめるために置いている。
 * STEP 06 でここに打刻の状態機械が入り、
 * 「React のボタン出し分け」と「Hono のバリデーション」が同じ定義を使うようになる。
 */
export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  time: z.string(),
})

export type Health = z.infer<typeof healthSchema>
