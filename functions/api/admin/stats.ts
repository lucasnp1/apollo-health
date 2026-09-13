import type { PagesFunction, Env } from '../../_lib/types'
import { jsonError, jsonOk, requireAdmin } from '../../_lib/auth'

// GET /api/admin/stats — sign-ups, sources, activation and plan counts.
// Admin session, or `Authorization: Bearer <ADMIN_STATS_TOKEN>` so the weekly
// digest script can read it without a browser. No personal data leaves here:
// every number is a count.

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function tokenOk(env: Env, request: Request): Promise<boolean> {
  const want = env.ADMIN_STATS_TOKEN
  if (!want) return false
  const got = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!got) return false
  // Compare hashes so lengths never leak through timing.
  return (await sha256Hex(got)) === (await sha256Hex(want))
}

type Row = Record<string, unknown>

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await tokenOk(env, request))) {
    const auth = await requireAdmin(env, request)
    if (auth instanceof Response) return auth
  }

  const now = Date.now()
  const since30 = now - 30 * 86_400_000
  const since7 = now - 7 * 86_400_000
  const day30 = new Date(since30).toISOString().slice(0, 10)

  try {
    const [perDay, perSource, withExam, withInjection, plans, feedback, total, last7, hits] = await env.DB.batch([
      env.DB.prepare(`SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n FROM users WHERE created_at > ? GROUP BY day ORDER BY day`).bind(since30),
      env.DB.prepare(`SELECT COALESCE(signup_source, 'direct') AS source, COUNT(*) AS n FROM users GROUP BY source ORDER BY n DESC`),
      env.DB.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM exams WHERE deleted_at IS NULL`),
      env.DB.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM injections WHERE deleted_at IS NULL`),
      env.DB.prepare(`SELECT COALESCE(plan, 'free') AS plan, COALESCE(plan_kind, '') AS kind, COUNT(*) AS n FROM users GROUP BY plan, kind`),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM feedback`),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM users`),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE created_at > ?`).bind(since7),
      env.DB.prepare(`SELECT path, SUM(n) AS n FROM page_hits WHERE day >= ? GROUP BY path ORDER BY n DESC`).bind(day30),
    ])
    const one = (r: { results?: unknown[] }) => Number((r.results?.[0] as Row | undefined)?.n ?? 0)
    return jsonOk({
      generatedAt: new Date(now).toISOString(),
      users: { total: one(total), last7Days: one(last7), withLabPanel: one(withExam), withInjection: one(withInjection) },
      signupsPerDay: (perDay.results ?? []) as Array<{ day: string; n: number }>,
      signupsBySource: (perSource.results ?? []) as Array<{ source: string; n: number }>,
      plans: (plans.results ?? []) as Array<{ plan: string; kind: string; n: number }>,
      feedbackCount: one(feedback),
      pageHits30Days: (hits.results ?? []) as Array<{ path: string; n: number }>,
    })
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Stats query failed', 500)
  }
}
