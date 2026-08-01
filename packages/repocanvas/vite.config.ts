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
      jsAssetsFilterFunction: (chunk) =>
        chunk.isEntry && ['index', 'editor', 'library'].includes(chunk.name),
      useStrictCSP: true,
    }),
  ],

  build: {
    lib: {
      entry: {
        index: 'src/index.ts',
        core: 'src/core.ts',
        editor: 'src/editor.ts',
        library: 'src/library.ts',
        testing: 'src/testing.ts',
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
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
