import type { PagesFunction, Env } from '../../_lib/types'
import { randomToken, verifyPassword } from '../../_lib/crypto'
import { ipHash, jsonError, jsonOk, sessionCookie, sessionTtlMs } from '../../_lib/auth'
import { wrap } from '../../_lib/handler'

// Login throttle: if an IP has produced ≥THROTTLE_THRESHOLD failed login
// attempts within THROTTLE_WINDOW_MS, reject further attempts with 429 until
// the window rolls forward. Uses the existing audit_log table — we count
// rows with action='login_fail' for the requesting IP hash. Avoids a new
// table/migration on the hot path.
const THROTTLE_WINDOW_MS = 30_000
const THROTTLE_THRESHOLD = 5

export const onRequestPost: PagesFunction<Env> = wrap<Env>(async ({ request, env }) => {
  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid JSON body', 400)
  }
  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''
  if (!email || !password) return jsonError('Email and password required', 400)

  const iph = await ipHash(request)
  const now = Date.now()

  // Throttle check — only when we have an identifiable IP hash.
  if (iph) {
    const recent = await env.DB
      .prepare(
        `SELECT COUNT(*) AS n FROM audit_log
         WHERE ip_hash = ? AND action = 'login_fail' AND at > ?`,
      )
      .bind(iph, now - THROTTLE_WINDOW_MS)
      .first<{ n: number }>()
    if (recent && recent.n >= THROTTLE_THRESHOLD) {
      return jsonError('Too many attempts. Try again in 30 seconds.', 429, {}, {
        'Retry-After': '30',
      })
    }
  }

  const user = await env.DB
    .prepare(
      `SELECT id, email, password_hash, password_salt, iterations, is_admin, display_name
       FROM users WHERE email = ?`,
    )
    .bind(email)
    .first<{
      id: string
      email: string
      password_hash: string
      password_salt: string
      iterations: number
      is_admin: number
      display_name: string | null
    }>()

  // Constant-time-ish: still attempt a verify even on missing user to avoid trivial timing oracle.
  const ok = user
    ? await verifyPassword(password, user.password_salt, user.password_hash, user.iterations)
    : (await verifyPassword(password, 'AAAAAAAAAAAAAAAAAAAAAA==', 'x', 1000), false)
  if (!user || !ok) {
    // Record the failure for throttling. Don't reveal whether email exists.
    await env.DB
      .prepare('INSERT INTO audit_log (user_id, action, meta, ip_hash, at) VALUES (?, ?, ?, ?, ?)')
      .bind(null, 'login_fail', null, iph, now)
      .run()
    return jsonError('Email or password incorrect', 401)
  }

  const token = randomToken()
  const expiresAt = now + sessionTtlMs()
  const ua = request.headers.get('User-Agent')?.slice(0, 200) ?? null

  await env.DB
    .prepare(
      `INSERT INTO sessions (token, user_id, expires_at, created_at, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(token, user.id, expiresAt, now, ua, iph)
    .run()

  await env.DB
    .prepare('INSERT INTO audit_log (user_id, action, meta, ip_hash, at) VALUES (?, ?, ?, ?, ?)')
    .bind(user.id, 'login', null, iph, now)
    .run()

  return jsonOk(
    { user: { id: user.id, email: user.email, is_admin: user.is_admin, display_name: user.display_name } },
    { headers: { 'Set-Cookie': sessionCookie(token) } },
  )
})
