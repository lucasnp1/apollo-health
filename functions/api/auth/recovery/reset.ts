import type { PagesFunction, Env } from '../../../_lib/types'
import { ipHash, jsonError } from '../../../_lib/auth'
import { wrap } from '../../../_lib/handler'
import { passwordProblem } from '../../../_lib/password'
import { consumeCode } from '../../../_lib/recovery'
import { applyNewPasswordAndSignIn } from '../../../_lib/passwordReset'

// POST /api/auth/recovery/reset { email, code, password }
// Password reset with a one-time recovery code. Never says which of the
// email or code was wrong, and is throttled per IP.
const THROTTLE_WINDOW_MS = 10 * 60 * 1000
const THROTTLE_THRESHOLD = 5

export const onRequestPost: PagesFunction<Env> = wrap<Env>(async ({ request, env }) => {
  let body: { email?: string; code?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid request', 400)
  }
  const email = (body.email || '').trim().toLowerCase()
  const code = (body.code || '').trim()
  const password = body.password || ''
  if (!email || !code) return jsonError('Enter your email and a recovery code', 400)
  const problem = passwordProblem(password)
  if (problem) return jsonError(problem, 400)

  const iph = await ipHash(request)
  const now = Date.now()
  if (iph) {
    const recent = await env.DB
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE ip_hash = ? AND action = 'recovery_fail' AND at > ?`)
      .bind(iph, now - THROTTLE_WINDOW_MS)
      .first<{ n: number }>()
    if (recent && recent.n >= THROTTLE_THRESHOLD) {
      return jsonError('Too many attempts. Try again in a few minutes.', 429, {}, { 'Retry-After': '600' })
    }
  }

  const user = await env.DB
    .prepare('SELECT id, email, is_admin, display_name FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string; email: string; is_admin: number; display_name: string | null }>()
  const ok = user ? await consumeCode(env, user.id, code) : false
  if (!user || !ok) {
    await env.DB
      .prepare('INSERT INTO audit_log (user_id, action, meta, ip_hash, at) VALUES (?, ?, ?, ?, ?)')
      .bind(user?.id ?? null, 'recovery_fail', null, iph, now)
      .run()
    return jsonError('Email or recovery code incorrect', 401)
  }

  return applyNewPasswordAndSignIn(env, request, user, password, [], 'password_recovery')
})
