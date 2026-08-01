import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * The app is served under a sub-path.
 *
 * utilipayhub.com serves the marketing site at the root, so the dashboard lives
 * at /app/. Vite needs this at build time to rewrite asset URLs, and React Router
 * reads it back through import.meta.env.BASE_URL as its basename. Overridable so
 * a deployment that puts the app on its own subdomain can set APP_BASE_PATH=/.
 */
const basePath = process.env.APP_BASE_PATH ?? '/app/'

export default defineConfig({
  base: basePath,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // In development the API runs separately, so /api is proxied to it. This
    // keeps requests same-origin exactly as they are in production behind nginx,
    // so CORS behaviour cannot differ between the two.
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET ?? 'http://localhost:8099',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Chunked so a returning user does not re-download the whole bundle after a
    // deploy that only touched application code.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('recharts') || id.includes('d3-')) return 'charts'
          if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/')) {
            return 'react'
          }
          if (id.includes('@radix-ui')) return 'radix'
          return 'vendor'
        },
      },
    },
  },
})
