import { createFileRoute, Outlet } from '@tanstack/react-router'
import { ForbiddenError } from '../../lib/errors'

/**
 * /admin 以下の画面は admin 限定。
 *
 * 画面側のこのチェックは「見せない」ための UX であって、守りの本体ではない。
 * 本当の防御は API 側の requireRole('admin')。画面だけで止めても、API を直接叩かれれば意味がない。
 */
export const Route = createFileRoute('/_authenticated/admin')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'admin') throw new ForbiddenError()
  },
  component: Outlet,
})
