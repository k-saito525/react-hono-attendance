import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

/**
 * /api を API サーバへ転送し、web から見て同一オリジンにする。
 *
 * 別オリジンのままにすると SameSite=Lax の Cookie が送信されず、
 * CORS 設定と CSRF 対策が芋づる式に必要になる。
 * docs/spec.md の「オリジン方針」を参照。
 *
 * 転送先は API_ORIGIN で変えられる。E2E は開発中のサーバとぶつからないよう、API を別のポートで動かすため。
 */
const proxy: Record<string, ProxyOptions> = {
  '/api': {
    target: process.env.API_ORIGIN ?? 'http://localhost:3000',
    changeOrigin: false,
  },
}

export default defineConfig({
  plugins: [
    /**
     * src/routes/ のファイル構成から、型付きのルート一覧（src/routeTree.gen.ts）を生成する。
     * React のプラグインより前に置くこと（生成物を React 側が読むため）。
     * autoCodeSplitting: 画面ごとにコードを分割し、開いた画面の分だけ読み込む。
     */
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    // Tailwind CSS v4。設定ファイルは不要で、src/styles.css の @import だけで有効になる
    tailwindcss(),
  ],
  // 開発サーバ（pnpm dev）
  server: { port: 5173, proxy },
  // 本番ビルドの配信（vite preview）。E2E はこちらを相手にする
  preview: { port: 4173, proxy },
})
