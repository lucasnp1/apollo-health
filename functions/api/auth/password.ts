import type { PagesFunction, Env } from '../../_lib/types'
import { deriveArgon2Hash, randomSalt, serializeSalt, verifyPassword, type HashAlgorithm } from '../../_lib/crypto'
import { ipHash, jsonError, jsonOk, readSessionToken, requireUser } from '../../_lib/auth'
import { wrap } from '../../_lib/handler'
import { passwordProblem } from '../../_lib/password'

// POST /api/auth/password { currentPassword, newPassword }
// Signed-in password change. Re-checks the current password, then signs out
// every other device (this session stays).
export const onRequestPost: PagesFunction<Env> = wrap<Env>(async ({ request, env }) => {
  const auth = await requireUser(env, request)
  if (auth instanceof Response) return auth

  let body: { currentPassword?: string; newPassword?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid request', 400)
  }
  const current = body.currentPassword || ''
  const next = body.newPassword || ''
  const problem = passwordProblem(next)
  if (problem) return jsonError(problem, 400)

  const row = await env.DB
    .prepare('SELECT password_hash, password_salt, iterations, algorithm FROM users WHERE id = ?')
    .bind(auth.user.id)
    .first<{ password_hash: string; password_salt: string; iterations: number; algorithm: string }>()
  if (!row) return jsonError('Unauthorized', 401)

  const ok = await verifyPassword((row.algorithm as HashAlgorithm) ?? 'pbkdf2', current, row.password_salt, row.password_hash, row.iterations)
  if (!ok) return jsonError('Current password is incorrect', 401)

  const now = Date.now()
  const salt = randomSalt()
  const hash = await deriveArgon2Hash(next, salt)
  const keep = readSessionToken(request) ?? ''
  const iph = await ipHash(request)

  await env.DB.batch([
    env.DB
      .prepare(`UPDATE users SET password_hash = ?, password_salt = ?, algorithm = 'argon2id', iterations = 0, updated_at = ? WHERE id = ?`)
      .bind(hash, serializeSalt(salt), now, auth.user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').bind(auth.user.id, keep),
    env.DB.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(auth.user.id),
    env.DB
      .prepare('INSERT INTO audit_log (user_id, action, meta, ip_hash, at) VALUES (?, ?, ?, ?, ?)')
      .bind(auth.user.id, 'password_change', null, iph, now),
  ])

  return jsonOk({ ok: true })
})
