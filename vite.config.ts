import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Vite 8 / Rolldown chunk splitting
    rolldownOptions: {
      // Two pages: the marketing landing at / and the app at /app/.
      input: {
        landing: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app/index.html', import.meta.url)),
      },
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
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,        // activate new SW immediately, no waiting
        clientsClaim: true,       // take control of all open tabs right away
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{css,html,js,json,mjs,svg,webmanifest}'],
        // OCR runtime (worker + wasm + model, ~10 MB) is fetched on demand,
        // never precached.
        globIgnores: ['ocr/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // The app shell only answers navigations under /app/. The landing
        // page, legal pages and the API always go to the network.
        navigateFallback: '/app/index.html',
        navigateFallbackAllowlist: [/^\/app(\/|$)/],
        navigateFallbackDenylist: [/^\/local-seed\//, /^\/api\//, /^\/privacy/, /^\/terms/],
      },
      manifest: {
        name: 'Apollo Health',
        short_name: 'Apollo',
        description: 'Your private tracker for injections, blood pressure, weight, symptoms and lab results.',
        // Dark-first: match the app's near-black surface so the install splash
        // and task-switcher tint don't flash warm white (the old, rejected look).
        theme_color: '#14161c',
        background_color: '#14161c',
        display: 'standalone',
        id: '/app/',
        start_url: '/app/',
        scope: '/app/',
        icons: [
          { src: '/logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/logo-256.png', sizes: '256x256', type: 'image/png', purpose: 'any' },
          { src: '/logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
