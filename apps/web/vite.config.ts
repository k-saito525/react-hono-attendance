import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
  server: {
    port: 5173,
    proxy: {
      /**
       * /api を API サーバへ転送し、web から見て同一オリジンにする。
       *
       * 別オリジンのままにすると SameSite=Lax の Cookie が送信されず、
       * CORS 設定と CSRF 対策が芋づる式に必要になる。
       * docs/spec.md の「オリジン方針」を参照。
       */
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
})
