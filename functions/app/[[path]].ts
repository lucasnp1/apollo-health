import type { PagesFunction, Env } from '../_lib/types'

// /app/* deep links (e.g. /app/reset?token=...) serve the app shell; the app
// reads the URL itself. A `_redirects` rewrite can't do this because Pages
// strips `/index.html` and would loop, so it is a tiny function instead.
// `/app/` itself is a real static file and falls through untouched.
export const onRequestGet: PagesFunction<Env> = async ({ request, env, next }) => {
  const url = new URL(request.url)
  if (url.pathname === '/app/' || url.pathname === '/app') return next()
  const shell = await env.ASSETS.fetch(new Request(new URL('/app/', url.origin), { headers: request.headers }))
  return new Response(shell.body, {
    status: shell.ok ? 200 : shell.status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
}
