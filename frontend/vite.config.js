import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/predict': 'http://localhost:8000',
      '/api/ai':      'http://localhost:8000',
      '/api/auth':    'http://localhost:3001',
      '/api/obs':     'http://localhost:3002',
      '/api/geo':     'http://localhost:3003',
    }
  }
})
