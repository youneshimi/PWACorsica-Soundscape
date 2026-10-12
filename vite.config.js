import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { serviceWorkerPlugin } from './build/service-worker.js'
import { seoPlugin } from './build/seo.js'

const proxy = {
  '/api': { target: 'http://localhost:3001', changeOrigin: true },
  '/uploads': { target: 'http://localhost:3001', changeOrigin: true },
}

// https://vite.dev/config/
export default defineConfig({
  appType: 'mpa',
  plugins: [react(), seoPlugin(), serviceWorkerPlugin()],
  server: {
    proxy,
  },
  preview: { proxy },
})
