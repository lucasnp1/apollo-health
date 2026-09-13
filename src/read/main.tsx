// Entry for the public, no-account "Read my bloods" page at /read.
// Shares the app's tokens and components; nothing here touches the database.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { ReadPage } from './ReadPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ReadPage />
    </ErrorBoundary>
  </StrictMode>,
)
