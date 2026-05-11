import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/predict': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        timeout: 60000,
      },
      '/api/ai': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        timeout: 60000,
      },
      '/api/auth': 'http://127.0.0.1:3001',
      '/api/obs':  'http://127.0.0.1:3002',
      '/api/geo':  'http://127.0.0.1:3003',
    }
  }
})
