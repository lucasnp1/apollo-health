// Pages Functions middleware — runs before any routed function or static asset.
// Two responsibilities:
//   1) Carry over Codex's preview-deploy seed protection (404 /local-seed/ on
//      non-canonical hostnames).
//   2) Send security headers on every response (HSTS, Referrer, etc.).
//
// Replaces the prior `public/_worker.js` which intercepted everything and
// blocked the `functions/` directory from being picked up at all.

import type { PagesFunction } from './_lib/types'

const PROTECTED_HOST = 'apollo-health-5fe.pages.dev'

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
}

export const onRequest: PagesFunction = async ({ request, next }) => {
  const url = new URL(request.url)

  // 1) Seed protection: only serve /local-seed/* on the canonical pages.dev host.
  if (url.pathname.startsWith('/local-seed/') && url.hostname !== PROTECTED_HOST) {
    return new Response('Not found', {
      status: 404,
      headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
    })
  }

  const response = await next()

  // 2) Apply security headers (Cloudflare strips Set-Cookie if we clone aggressively,
  //    so we mutate the existing response via Headers).
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
