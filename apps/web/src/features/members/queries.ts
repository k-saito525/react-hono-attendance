import { queryOptions } from '@tanstack/react-query'
import { client, parseResponse } from '../../lib/api'

/** メンバー一覧（管理者用）。型は API のルート定義から来る */
export const membersQueryOptions = queryOptions({
  queryKey: ['admin', 'members'],
  queryFn: () => parseResponse(client.api.admin.members.$get()),
})

export type Member = Awaited<ReturnType<typeof membersQueryOptions.queryFn & {}>>[number]
