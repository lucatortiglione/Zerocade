import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Same-origin API, as in production: Vite forwards /api and the socket to the server.
// A build is hosted by the Zerocade server under /overlay/. Bivio's artwork is read
// straight from the game's own folder (@bivio = gioco-dilemmi/assets).
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/overlay/' : '/',
  resolve: {
    alias: { '@bivio': fileURLToPath(new URL('../../gioco-dilemmi/assets', import.meta.url)) },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
    },
  },
}))
