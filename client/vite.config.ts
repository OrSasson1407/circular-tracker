import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => console.log('proxy error', err))
          proxy.on('proxyReq', (_, req) => console.log('proxying:', req.method, req.url))
          proxy.on('proxyRes', (res) => console.log('proxy res:', res.statusCode))
        },
      },
      '/auth': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => console.log('proxy error', err))
          proxy.on('proxyReq', (_, req) => console.log('proxying:', req.method, req.url))
          proxy.on('proxyRes', (res) => console.log('proxy res:', res.statusCode))
        },
      },
    },
  },
})