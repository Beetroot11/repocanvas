import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default defineConfig({
  plugins: [
    react(),
    cssInjectedByJsPlugin({
      attributes: {
        'data-repocanvas-styles': 'true',
      },
      jsAssetsFilterFunction: (chunk) => chunk.isEntry,
      useStrictCSP: true,
    }),
  ],

  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
      cssFileName: 'repocanvas',
    },

    rollupOptions: {
      external: (id) =>
        id === 'react' ||
        id.startsWith('react/') ||
        id === 'react-dom' ||
        id.startsWith('react-dom/') ||
        id === '@excalidraw/excalidraw' ||
        id.startsWith('@excalidraw/excalidraw/'),
    },
  },
})