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
      '/api/preferences': 'http://127.0.0.1:3001',
      '/api/panel': 'http://127.0.0.1:3001',
      '/api/observations': 'http://127.0.0.1:3002',
      '/api/obs':  'http://127.0.0.1:3002',
      '/api/geo':  'http://127.0.0.1:3003',
      '/api/thumbnails': 'http://127.0.0.1:3004',
      '/api/explorer': 'http://127.0.0.1:3005',
      '/api/notifications': 'http://127.0.0.1:3006',
      // Catálogo público de contenido (K): fichas publicadas en el Admin → Contenido.
      '/api/dataset/publico': 'http://127.0.0.1:3008',
    }
  }
})
