import { type ErrorComponentProps, Link } from '@tanstack/react-router'
import { isForbidden } from '../lib/errors'

/**
 * 画面単位のエラー表示。
 * 想定外のエラーの詳細（スタックトレースなど）は画面に出さない。
 */
export function ErrorView({ error }: ErrorComponentProps) {
  if (isForbidden(error)) {
    return <Message title="権限がありません" body="このページは管理者のみ閲覧できます。" />
  }

  console.error(error)
  return (
    <Message
      title="エラーが発生しました"
      body="時間をおいて再度お試しください。解決しない場合は管理者に連絡してください。"
    />
  )
}

export function NotFoundView() {
  return <Message title="ページが見つかりません" body="URL が正しいか確認してください。" />
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm text-gray-600">{body}</p>
      <Link to="/" className="mt-6 inline-block text-sm text-blue-700 underline">
        ホームへ戻る
      </Link>
    </div>
  )
}
