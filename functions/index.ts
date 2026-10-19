import type { PagesFunction, Env } from './_lib/types'
import { countHit, isPageView } from './_lib/hits'

// GET / — the marketing landing page lives here as a static file. (Signed-in
// visitors used to be sent on to /app/; the web app was retired on 19 Oct 2026.)
// Visits are counted as a plain number per day (see _lib/hits.ts).
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const { request, next, env } = ctx
  if (isPageView(request)) countHit(env, ctx, '/')
  return next()
}
