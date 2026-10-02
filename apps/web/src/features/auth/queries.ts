import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { client, isHttpError, parseResponse } from '../../lib/api'

/**
 * ログイン中のユーザー。未ログインなら null。
 *
 * ログイン状態はこの結果だけで判定する。localStorage などに別途持つと、
 * Cookie の実際の状態（期限切れ・別タブでのログアウト）とずれるため。
 * 401 はエラーではなく「未ログイン」という正常な結果として null にする。
 */
export const meQueryOptions = queryOptions({
  queryKey: ['auth', 'me'],
  queryFn: async () => {
    try {
      return (await parseResponse(client.api.auth.me.$get())).user
    } catch (error) {
      if (isHttpError(error, 401)) return null
      throw error
    }
  },
  staleTime: 5 * 60 * 1000,
})

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof meQueryOptions.queryFn & {}>>>

/**
 * ログアウト。
 *
 * 成功したらキャッシュを丸ごと消す。消さないと、同じブラウザで次にログインした人に
 * 前の人のデータ（メンバー一覧など）が一瞬見える。
 * 失敗した場合はキャッシュを残す（サーバ側のセッションが生きている可能性があるため、
 * 「ログアウトしたつもり」にさせない）。
 */
export const useLogout = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: () => parseResponse(client.api.auth.logout.$post()),
    onSuccess: async () => {
      queryClient.clear()
      queryClient.setQueryData(meQueryOptions.queryKey, null)
      await navigate({ to: '/login' })
    },
  })
}
