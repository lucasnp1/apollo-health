import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Side-effect import: applies the saved (or default dark) theme to <html>
// before first paint. Must stay eager — views import useTheme lazily.
import './lib/useTheme'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

// ── PWA update handling ──────────────────────────────────────────────────────
// An installed (home-screen) PWA otherwise clings to its cached build: it never
// picks up a new deploy, and can half-break when the stale shell asks for a JS
// chunk that a newer deploy has already purged (404 → the lazy import throws).
// Three guards fix that:
//   1. Reload once when a freshly-activated service worker takes control.
//   2. Actively re-check for a new SW on launch, on focus/resume, and hourly —
//      so the installed app notices deploys instead of waiting for a cold kill.
//   3. Self-heal: if a lazy chunk fails to load (old shell vs. purged chunk),
//      reload into the current build.
// A small per-session budget keeps all of that from becoming a reload loop if
// something is genuinely broken.
function reloadOnce() {
  try {
    const KEY = 'apollo:autoReloads'
    const now = Date.now()
    const prev = JSON.parse(sessionStorage.getItem(KEY) || '{}')
    let n = typeof prev.n === 'number' ? prev.n : 0
    let first = typeof prev.first === 'number' ? prev.first : now
    if (now - first > 60_000) { n = 0; first = now } // fresh 60s window
    if (n >= 3) return                               // give up — never loop forever
    sessionStorage.setItem(KEY, JSON.stringify({ n: n + 1, first }))
  } catch { /* sessionStorage blocked — fall through and reload anyway */ }
  window.location.reload()
}

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only reload when an UPDATE takes over an already-controlled page — never
    // on the very first install (no prior controller).
    if (refreshing || !hadController) return
    refreshing = true
    reloadOnce()
  })

  navigator.serviceWorker.ready.then((reg) => {
    const check = () => { void reg.update().catch(() => {}) }
    // Reopening the home-screen app (resume) and, as a backstop, hourly while
    // it stays open. This is what makes an installed PWA actually see deploys.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
    setInterval(check, 60 * 60 * 1000)
  }).catch(() => { /* no service worker yet */ })

  // Once a load has been stable for a while, clear the budget so a genuine
  // future version mismatch still gets its retries.
  setTimeout(() => { try { sessionStorage.removeItem('apollo:autoReloads') } catch { /* ignore */ } }, 30_000)
}

// A dynamically-imported chunk failed to load — almost always a stale shell
// reaching for a file a newer deploy removed. Reload into the current build;
// if the budget is spent, the error falls through to the ErrorBoundary.
window.addEventListener('vite:preloadError', () => { reloadOnce() })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
