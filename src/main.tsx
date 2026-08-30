import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Side-effect import: applies the saved (or default dark) theme to <html>
// before first paint. Must stay eager — views import useTheme lazily.
import './lib/useTheme'
import App from './App.tsx'

// PWA auto-refresh: when a freshly deployed service worker takes control
// (skipWaiting + clientsClaim are on), reload once so the new assets actually
// render — instead of the app silently serving the old cached build until the
// user manually clears it. Guarded so it never reloads on the first-ever
// install (no prior controller) or loops.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !hadController) return
    refreshing = true
    window.location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
