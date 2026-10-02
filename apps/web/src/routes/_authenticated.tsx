import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { meQueryOptions, useLogout } from '../features/auth/queries'

/**
 * ログインが必要な画面をまとめるレイアウト。
 * 先頭の _ は「URL に現れないルート」の意味で、/_authenticated というパスにはならない。
 *
 * 画面を描画する前（beforeLoad）にログイン状態を確かめるので、
 * 未ログインの人に中身が一瞬見えることはない。
 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions)
    if (!user) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    // 子のルートから context.user で参照できるようにする
    return { user }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext()
  const logout = useLogout()

  return (
    <>
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3">
          <Link to="/" className="font-semibold">
            勤怠管理
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link
              to="/"
              className="text-gray-600 hover:text-gray-900 [&.active]:font-medium [&.active]:text-gray-900"
            >
              ホーム
            </Link>
            {user.role === 'admin' && (
              <Link
                to="/admin/members"
                className="text-gray-600 hover:text-gray-900 [&.active]:font-medium [&.active]:text-gray-900"
              >
                メンバー
              </Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-gray-600">{user.name}</span>
            <button
              type="button"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="rounded-md border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-60"
            >
              ログアウト
            </button>
          </div>
        </div>
        {logout.isError && (
          <p role="alert" className="mx-auto max-w-4xl px-4 pb-2 text-sm text-red-700">
            ログアウトに失敗しました。もう一度お試しください。
          </p>
        )}
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Outlet />
      </main>
    </>
  )
}
