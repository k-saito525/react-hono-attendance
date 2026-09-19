import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
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
