import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  build: {
    // Vite 8 / Rolldown chunk splitting
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'vendor-react',  test: /node_modules\/(react|react-dom|scheduler)\// },
            { name: 'vendor-charts', test: /node_modules\/(recharts|d3-|victory-)/ },
            { name: 'vendor-dexie',  test: /node_modules\/(dexie)/ },
            { name: 'vendor-dates',  test: /node_modules\/(date-fns)/ },
            { name: 'vendor-icons',  test: /node_modules\/(lucide-react)/ },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,        // activate new SW immediately, no waiting
        clientsClaim: true,       // take control of all open tabs right away
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{css,html,js,json,mjs,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/local-seed\//],
      },
      manifest: {
        name: 'Apollo Health',
        short_name: 'Apollo',
        description: 'A local-first medication, vitals, labs, and exam tracker.',
        theme_color: '#0f8f84',
        background_color: '#f7f9fa',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
