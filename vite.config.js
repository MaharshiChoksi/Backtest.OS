import { defineConfig } from 'vite'
import react            from '@vitejs/plugin-react'
import { resolve }      from 'path'

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@':          resolve(__dirname, 'src'),
      '@constants': resolve(__dirname, 'src/constants'),
      '@utils':     resolve(__dirname, 'src/utils'),
      '@store':     resolve(__dirname, 'src/store'),
      '@hooks':     resolve(__dirname, 'src/hooks'),
      '@components':resolve(__dirname, 'src/components'),
    },
  },

  server: {
    port: 5173,
    open: true,
  },

  build: {
    target:   'es2022',
    outDir:   'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor':  ['react', 'react-dom'],
          'chart-vendor':  ['lightweight-charts'],
          'state-vendor':  ['zustand'],
          'parse-vendor':  ['papaparse'],
        },
      },
    },
  },
})