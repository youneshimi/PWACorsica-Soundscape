import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { serviceWorkerPlugin } from './build/service-worker.js'
import { seoPlugin } from './build/seo.js'

const proxy = {
  '/api': { target: 'http://localhost:8798', changeOrigin: true },
  '/uploads': { target: 'http://localhost:8798', changeOrigin: true },
}

// https://vite.dev/config/
export default defineConfig({
  appType: 'mpa',
  plugins: [react(), seoPlugin(), serviceWorkerPlugin()],
  server: {
    port: 5174,
    strictPort: true,
    proxy,
  },
  preview: { port: 4183, strictPort: true, proxy },
})
