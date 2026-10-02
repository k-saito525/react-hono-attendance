import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, type RouterHistory, RouterProvider } from '@tanstack/react-router'
import { ErrorView } from './components/error-view'
import { meQueryOptions } from './features/auth/queries'
import { isHttpError } from './lib/api'
import { routeTree } from './routeTree.gen'

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /**
       * 401 を「セッション切れ」として扱わない。
       * ログインの失敗（パスワード違い）も 401 なので、ログインのミューテーションにだけ付ける。
       */
      skipSessionExpiry?: boolean
    }
  }
}

/**
 * アプリ一式（ルーターと QueryClient）を組み立てる。
 * 本番（main.tsx）とテストの両方がこれを使い、テストでは履歴だけをメモリ上のものに差し替える。
 */
export const createApp = (options: { history?: RouterHistory } = {}) => {
  // QueryClient の方が先に必要なので、ルーターは後から入れる
  let router: AppRouter | undefined

  /**
   * 使っている途中でセッションが切れたとき（どこかの API が 401 を返したとき）の処理を1か所に集める。
   * 画面ごとに 401 を気にしなくて済むようにするため。
   */
  const handleSessionExpired = (error: unknown) => {
    if (!isHttpError(error, 401) || !router) return
    queryClient.setQueryData(meQueryOptions.queryKey, null)
    if (router.state.location.pathname === '/login') return
    void router.navigate({
      to: '/login',
      search: { redirect: router.state.location.href },
    })
  }

  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: handleSessionExpired }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
        if (!mutation.meta?.skipSessionExpiry) handleSessionExpired(error)
      },
    }),
    defaultOptions: {
      queries: {
        // 4xx / 5xx は何度やり直しても結果が変わらないので再試行しない。通信エラーだけ再試行する
        retry: (failureCount, error) => !isHttpError(error) && failureCount < 2,
      },
    },
  })

  router = createAppRouter(queryClient, options.history)
  return { router, queryClient }
}

const createAppRouter = (queryClient: QueryClient, history?: RouterHistory) =>
  createRouter({
    routeTree,
    history,
    context: { queryClient },
    // リンクにカーソルを載せた時点で、遷移先のデータを先読みする
    defaultPreload: 'intent',
    // 先読みの鮮度管理は TanStack Query に任せる
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ErrorView,
    scrollRestoration: true,
  })

type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}

export function App({ router, queryClient }: ReturnType<typeof createApp>) {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
