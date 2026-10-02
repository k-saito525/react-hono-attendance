import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { MembersTable } from '../../../features/members/members-table'
import { membersQueryOptions } from '../../../features/members/queries'

export const Route = createFileRoute('/_authenticated/admin/members')({
  // 画面を描画する前にデータを取りに行く（描画してから取りに行くより表示が速い）
  loader: ({ context }) => context.queryClient.ensureQueryData(membersQueryOptions),
  component: MembersPage,
})

function MembersPage() {
  const { data: members } = useSuspenseQuery(membersQueryOptions)

  return (
    <section>
      <h1 className="text-xl font-semibold">メンバー</h1>
      <div className="mt-4">
        <MembersTable members={members} />
      </div>
    </section>
  )
}
