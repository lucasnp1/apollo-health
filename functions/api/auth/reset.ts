import type { PagesFunction, Env } from '../../_lib/types'
import { deriveArgon2Hash, randomSalt, randomToken, serializeSalt, sha256Hex } from '../../_lib/crypto'
import { ipHash, jsonError, jsonOk, sessionCookie, sessionTtlMs } from '../../_lib/auth'
import { wrap } from '../../_lib/handler'
import { passwordProblem } from '../../_lib/password'

// POST /api/auth/reset { token, password }
// Consumes a reset link: sets the new password, signs every existing session
// out, and signs the user straight in on this device.
const INVALID = 'This reset link is invalid or has expired. Request a new one.'

export const onRequestPost: PagesFunction<Env> = wrap<Env>(async ({ request, env }) => {
  let body: { token?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid request', 400)
  }
  const token = (body.token || '').trim()
  const password = body.password || ''
  if (!token) return jsonError(INVALID, 400)
  const problem = passwordProblem(password)
  if (problem) return jsonError(problem, 400)

  const now = Date.now()
  const tokenHash = await sha256Hex(token)
  const row = await env.DB
    .prepare('SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?')
    .bind(tokenHash)
    .first<{ user_id: string; expires_at: number; used_at: number | null }>()
  if (!row || row.used_at != null || row.expires_at < now) return jsonError(INVALID, 400)

  const user = await env.DB
    .prepare('SELECT id, email, is_admin, display_name FROM users WHERE id = ?')
    .bind(row.user_id)
    .first<{ id: string; email: string; is_admin: number; display_name: string | null }>()
  if (!user) return jsonError(INVALID, 400)

  const salt = randomSalt()
  const hash = await deriveArgon2Hash(password, salt)
  const iph = await ipHash(request)
  const sessionToken = randomToken()
  const ua = request.headers.get('User-Agent')?.slice(0, 200) ?? null

  await env.DB.batch([
    env.DB
      .prepare(`UPDATE users SET password_hash = ?, password_salt = ?, algorithm = 'argon2id', iterations = 0, updated_at = ? WHERE id = ?`)
      .bind(hash, serializeSalt(salt), now, user.id),
    env.DB.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').bind(now, tokenHash),
    // Anyone holding an old session (including whoever prompted the reset) is signed out.
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    env.DB
      .prepare('INSERT INTO sessions (token, user_id, expires_at, created_at, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(sessionToken, user.id, now + sessionTtlMs(), now, ua, iph),
    env.DB
      .prepare('INSERT INTO audit_log (user_id, action, meta, ip_hash, at) VALUES (?, ?, ?, ?, ?)')
      .bind(user.id, 'password_reset', null, iph, now),
  ])

  return jsonOk(
    { user: { id: user.id, email: user.email, is_admin: user.is_admin, display_name: user.display_name } },
    { headers: { 'Set-Cookie': sessionCookie(sessionToken) } },
  )
})
