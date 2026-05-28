import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    TanStackRouterVite({ autoCodeSplitting: true }),
    viteTsConfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    viteReact(),
    // basicSsl removed — plain HTTP works fine for QWebEngineView on localhost
    // and avoids the HTTPS/WSS mismatch that breaks HMR inside the webview
  ],
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
    },
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/ws':  { target: 'ws://localhost:8000', ws: true },
    },
  },
})
