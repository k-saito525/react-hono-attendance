import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import { type ZodType, z } from 'zod'

/**
 * 入力検証。失敗したら 400 とフィールド単位のエラーを返す。
 *
 *   { "message": "入力内容に誤りがあります",
 *     "errors": { "email": ["メールアドレスの形式が正しくありません"] } }
 *
 * エラーの形をここで統一しておくと、web 側はどの API でも同じ扱いでフォームに表示できる。
 */
export const validate = <T extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      /**
       * @hono/zod-validator は result.error を ZodError<スキーマの型> として渡してくるが、
       * Zod の ZodError<T> の T は「データの型」を想定している。そのままだと fieldErrors が {} になり、
       * web 側でフィールド名が補完されない。ライブラリの型の癖なので、ここで正しい型に付け直す。
       */
      const error = result.error as unknown as z.ZodError<z.output<T>>
      return c.json(
        {
          message: '入力内容に誤りがあります',
          errors: z.flattenError(error).fieldErrors,
        },
        400,
      )
    }
  })
