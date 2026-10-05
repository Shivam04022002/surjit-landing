import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the API runs separately on 127.0.0.1:5050; the proxy keeps
// requests same-origin (/api/...), exactly as Nginx does in production.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:5050',
        changeOrigin: false
      }
    }
  },
  build: {
    sourcemap: false,
    assetsInlineLimit: 4096
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
    restoreMocks: true
  }
})
