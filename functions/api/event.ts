import type { PagesFunction, Env } from '../_lib/types'
import { jsonError, jsonOk } from '../_lib/auth'
import { wrap } from '../_lib/handler'

// POST /api/event  { name }
//
// Counts one anonymous funnel event. Same storage as page views: one integer
// per name per day in page_hits, keyed "event:<name>". No cookie, no IP, no
// user agent, no session — it cannot tell you who did anything, only how many.
//
// It exists because /read had no instrumentation at all, so "4 hits on /read"
// could equally have been four completed reads or four bounces, and no change
// to the funnel could be evaluated.
//
// The whitelist is the security boundary: without it this is an open write
// into the stats table for anyone who finds the endpoint.
const ALLOWED = new Set([
  'read-started',    // a file was accepted and parsing began
  'read-completed',  // markers were found and the analysis rendered
  'read-empty',      // parsed, but nothing recognisable in the file
  'read-failed',     // parse threw
  'read-share',      // the share card was generated
  'read-save',       // "Save it in Magno" was clicked
])

export const onRequestPost: PagesFunction<Env> = wrap<Env>(async ({ env, request }) => {
  let name: unknown
  try {
    ({ name } = (await request.json()) as { name?: unknown })
  } catch {
    return jsonError('Bad request', 400)
  }
  if (typeof name !== 'string' || !ALLOWED.has(name)) return jsonError('Unknown event', 400)

  const day = new Date().toISOString().slice(0, 10)
  await env.DB
    .prepare(`INSERT INTO page_hits (day, path, n) VALUES (?, ?, 1) ON CONFLICT(day, path) DO UPDATE SET n = n + 1`)
    .bind(day, `event:${name}`)
    .run()
    .catch(() => undefined)

  return jsonOk({ ok: true })
})
