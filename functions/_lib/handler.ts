// Wraps a handler with a top-level try/catch so internal exceptions surface
// as JSON 500 instead of Cloudflare's opaque "error code 1101" page.
//
// Exception details (message + stack) are logged to console for Cloudflare
// log tail, but never sent to the client — leaking stack traces reveals
// file paths, env binding names, and internal logic to attackers.

import type { PagesFunction } from './types'

export function wrap<E, P extends string = never>(fn: PagesFunction<E, P>): PagesFunction<E, P> {
  return async (ctx) => {
    try {
      return await fn(ctx)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const stack = e instanceof Error ? e.stack : undefined
      console.error('[unhandled]', message, stack)
      return new Response(JSON.stringify({ error: 'Server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }
}
