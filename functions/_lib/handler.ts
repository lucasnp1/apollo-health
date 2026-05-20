// Wraps a handler with a top-level try/catch so internal exceptions surface
// as JSON 500 instead of Cloudflare's opaque "error code 1101" page.
import type { PagesFunction } from './types'

export function wrap<E, P extends string = never>(fn: PagesFunction<E, P>): PagesFunction<E, P> {
  return async (ctx) => {
    try {
      return await fn(ctx)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const stack = e instanceof Error ? e.stack : undefined
      return new Response(JSON.stringify({ error: 'Server error', detail: message, stack }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }
}
