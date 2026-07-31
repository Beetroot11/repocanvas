import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      {
        find: '@andrew/repocanvas',
        replacement: fileURLToPath(new URL('../../packages/repocanvas/src/index.ts', import.meta.url)),
      },
    ],
  },
  server: { port: 4173 },
})
