import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Side-effect import: applies the saved (or default dark) theme to <html>
// before first paint. Must stay eager — views import useTheme lazily.
import './lib/useTheme'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
