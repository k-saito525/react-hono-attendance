import { type LoginInput, loginInputSchema } from '@attendance/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { InferResponseType } from 'hono/client'
import { useForm } from 'react-hook-form'
import { client, errorBody, isHttpError, parseResponse } from '../../lib/api'
import { meQueryOptions } from './queries'

/** API が返す 400 の形。ルート定義から型を借りる */
type ValidationErrorBody = InferResponseType<typeof client.api.auth.login.$post, 400>

/**
 * ログインフォーム。
 *
 * 入力の検証は shared の loginInputSchema（API と同じ定義）で行う。
 * 形式の誤りは API を呼ばずにここで止め、API の 400 も同じ欄に表示する。
 */
export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: { email: '', password: '' },
  })

  const login = useMutation({
    mutationFn: (input: LoginInput) => parseResponse(client.api.auth.login.$post({ json: input })),
    // ログイン失敗の 401 を「セッション切れ」として扱わない
    meta: { skipSessionExpiry: true },
    onSuccess: async ({ user }) => {
      queryClient.setQueryData(meQueryOptions.queryKey, user)
      await navigate({ href: redirectTo ?? '/' })
    },
    onError: (error) => {
      if (isHttpError(error, 400)) {
        const body = errorBody<ValidationErrorBody>(error)
        for (const [field, messages] of Object.entries(body?.errors ?? {})) {
          if (messages?.[0]) setError(field as keyof LoginInput, { message: messages[0] })
        }
        return
      }
      if (isHttpError(error, 401)) {
        setError('root', { message: errorBody(error)?.message ?? 'ログインに失敗しました' })
        return
      }
      setError('root', { message: '通信に失敗しました。時間をおいて再度お試しください。' })
    },
  })

  return (
    <form onSubmit={handleSubmit((input) => login.mutate(input))} noValidate className="space-y-5">
      {errors.root && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors.root.message}
        </p>
      )}

      <Field id="email" label="メールアドレス" error={errors.email?.message}>
        <input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'email-error' : undefined}
          className={inputClass}
          {...register('email')}
        />
      </Field>

      <Field id="password" label="パスワード" error={errors.password?.message}>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? 'password-error' : undefined}
          className={inputClass}
          {...register('password')}
        />
      </Field>

      <button
        type="submit"
        disabled={login.isPending}
        className="w-full rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-60"
      >
        {login.isPending ? 'ログイン中…' : 'ログイン'}
      </button>
    </form>
  )
}

const inputClass =
  'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 aria-invalid:border-red-500'

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
