import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
