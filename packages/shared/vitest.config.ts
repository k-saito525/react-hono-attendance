import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'shared',
    // shared はブラウザと Node の両方で使われる純粋なロジックだけを置くので、
    // DOM も DB もない素の Node 環境でテストする
    environment: 'node',
  },
})
