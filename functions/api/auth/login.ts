import type { PagesFunction, Env } from '../../_lib/types'
import {
  deriveArgon2Hash,
  randomSalt,
  randomToken,
  serializeSalt,
  verifyPassword,
  type HashAlgorithm,
} from '../../_lib/crypto'
import { ipHash, jsonError, jsonOk, sessionCookie, sessionTtlMs } from '../../_lib/auth'
import { wrap } from '../../_lib/handler'

// Login throttle: if an IP has produced ≥THROTTLE_THRESHOLD failed login
// attempts within THROTTLE_WINDOW_MS, reject further attempts with 429 until
// the window rolls forward. Uses the existing audit_log table — we count
// rows with action='login_fail' for the requesting IP hash. Avoids a new
// table/migration on the hot path.
const THROTTLE_WINDOW_MS = 30_000
const THROTTLE_THRESHOLD = 5
// Per account too, so guessing one person's password from many IPs stays slow: 10 wrong passwords in 15 minutes
// pause password logins for that account (Apple/Google sign-in and recovery still work).
const ACCOUNT_WINDOW_MS = 15 * 60_000
const ACCOUNT_THRESHOLD = 10

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
      `SELECT id, email, password_hash, password_salt, iterations, is_admin, display_name, algorithm
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
      algorithm: string
    }>()

  if (user) {
    const fails = await env.DB
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE user_id = ? AND action = 'login_fail' AND at > ?`)
      .bind(user.id, now - ACCOUNT_WINDOW_MS)
      .first<{ n: number }>()
    if (fails && fails.n >= ACCOUNT_THRESHOLD) {
      return jsonError('Too many attempts. Try again in 15 minutes.', 429, {}, { 'Retry-After': '900' })
    }
  }

  // Constant-time-ish: still attempt a verify even on missing user to avoid
  // trivial timing oracle. We use a fixed PBKDF2 verify here intentionally —
  // the timing differs from an Argon2id verify but the attacker can't
  // observe the gap if they're throttled.
  const ok = user
    ? await verifyPassword(
        (user.algorithm as HashAlgorithm) ?? 'pbkdf2',
        password,
        user.password_salt,
        user.password_hash,
        user.iterations,
      )
    : (await verifyPassword('pbkdf2', password, 'AAAAAAAAAAAAAAAAAAAAAA==', 'x', 1000), false)
  if (!user || !ok) {
    // Record the failure for throttling. Don't reveal whether email exists.
    await env.DB
      .prepare('INSERT INTO audit_log (user_id, action, meta, ip_hash, at) VALUES (?, ?, ?, ?, ?)')
      .bind(user?.id ?? null, 'login_fail', null, iph, now)
      .run()
    return jsonError('Email or password incorrect', 401)
  }

  // Opportunistic rehash: if the user was created back when we only had
  // PBKDF2, upgrade them to Argon2id now that we know the plaintext
  // password (this is the only time we ever see it). Failure here is
  // non-fatal — the login itself succeeded, we just stay on PBKDF2 for
  // this user until the next attempt.
  if (user.algorithm !== 'argon2id') {
    try {
      const newSalt = randomSalt()
      const newHash = await deriveArgon2Hash(password, newSalt)
      await env.DB
        .prepare(
          `UPDATE users SET password_hash = ?, password_salt = ?, algorithm = 'argon2id', iterations = 0, updated_at = ?
           WHERE id = ?`,
        )
        .bind(newHash, serializeSalt(newSalt), now, user.id)
        .run()
    } catch (err) {
      console.warn('Failed to rehash to Argon2id for user', user.id, err)
    }
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
