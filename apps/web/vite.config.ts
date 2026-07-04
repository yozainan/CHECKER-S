import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@checkers/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
      '@checkers/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@checkers/engine': path.resolve(__dirname, '../../packages/engine/src/index.ts'),
      '@checkers/ai': path.resolve(__dirname, '../../packages/ai/src/index.ts'),
    },
  },
  server: {
    host: '0.0.0.0',   // Expose to all network interfaces
    port: 5173,
    proxy: {
      // Forward all WebSocket connections (game rooms + matchmaking) to the FastAPI backend
      '/ws': {
        target: 'http://localhost:8000',
        ws: true,
        changeOrigin: true,
      },
      // Forward REST API calls (room reset, health-check) to the backend
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
