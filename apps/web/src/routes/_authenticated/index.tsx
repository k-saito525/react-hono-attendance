import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/')({
  component: HomePage,
})

/** 仮のホーム。打刻画面は STEP 08 で作る */
function HomePage() {
  const { user } = Route.useRouteContext()

  return (
    <section>
      <h1 className="text-xl font-semibold">{user.name} さん、こんにちは</h1>
      <p className="mt-2 text-sm text-gray-600">打刻画面はここに作られる予定です（STEP 08）。</p>
    </section>
  )
}
