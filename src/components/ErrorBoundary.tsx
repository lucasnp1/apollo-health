import { Component, type ReactNode } from 'react'

/**
 * Last-resort safety net so a crash never leaves users on a blank screen.
 *
 * The most likely trigger in production is an outdated installed PWA reaching
 * for a JS chunk a newer deploy has already purged. main.tsx tries to auto-
 * reload into the fresh build when that happens; this visible fallback covers
 * the case where the auto-reload budget is exhausted (or any other render
 * crash), giving the user a single clear action.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Apollo crashed:', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-6 text-center">
        <div className="flex max-w-xs flex-col items-center gap-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Something went wrong loading the app. This usually means a new
            version is ready — reload to continue.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-card)]"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
