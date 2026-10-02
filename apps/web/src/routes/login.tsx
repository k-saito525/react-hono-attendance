import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { LoginForm } from '../features/auth/login-form'
import { meQueryOptions } from '../features/auth/queries'
import { isSafeRedirect } from '../lib/redirect'

/**
 * ?redirect= は自サイト内のパスだけを受け付ける（オープンリダイレクト対策）。
 * 不正な値は捨てて undefined にする（ログイン後はホームへ）。
 */
const searchSchema = z.object({
  redirect: z.string().refine(isSafeRedirect).optional().catch(undefined),
})

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  // ログイン済みでログイン画面を開いたら、そのまま戻り先へ
  beforeLoad: async ({ context, search }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions)
    if (user) throw redirect({ href: search.redirect ?? '/' })
  },
  component: LoginPage,
})

function LoginPage() {
  const { redirect: redirectTo } = Route.useSearch()

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-center text-xl font-semibold">勤怠管理</h1>
      <p className="mt-1 text-center text-sm text-gray-600">ログインしてください</p>
      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <LoginForm redirectTo={redirectTo} />
      </div>
    </main>
  )
}
