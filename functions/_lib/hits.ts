import type { Env } from './types'

// First-party page counting for the public pages: one number per path per
// day, written after the response is sent. No cookie, no IP, no user agent.
export function countHit(env: Env, ctx: { waitUntil(p: Promise<unknown>): void }, path: string): void {
  const day = new Date().toISOString().slice(0, 10)
  ctx.waitUntil(
    env.DB
      .prepare(`INSERT INTO page_hits (day, path, n) VALUES (?, ?, 1) ON CONFLICT(day, path) DO UPDATE SET n = n + 1`)
      .bind(day, path)
      .run()
      .catch(() => undefined),
  )
}

// Only count real page views: HTML navigations, not prefetches or bots that
// identify themselves. Search engine crawlers are welcome but not counted.
export function isPageView(request: Request): boolean {
  if (request.method !== 'GET') return false
  const accept = request.headers.get('Accept') ?? ''
  if (!accept.includes('text/html')) return false
  if (request.headers.get('Purpose') === 'prefetch' || request.headers.get('Sec-Purpose')?.includes('prefetch')) return false
  const ua = (request.headers.get('User-Agent') ?? '').toLowerCase()
  return !/bot|crawl|spider|slurp|facebookexternalhit|preview|lighthouse|headless/.test(ua)
}
