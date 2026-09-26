import { defineConfig, mergeConfig } from 'vitest/config'
// 設定ファイルは Vite が直接読み込むため、拡張子まで書く（Vite のネイティブ読み込みの要件）
import viteConfig from './vite.config.ts'

/**
 * vite.config.ts を土台にテスト設定を重ねる。
 * React のプラグインなど、開発時と同じ変換をテストでも使うため。
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      name: 'web',
      // ブラウザの DOM を Node 上で再現する
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  }),
)
