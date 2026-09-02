import type { PagesFunction, Env } from '../../../_lib/types'
import { verifyPassword, type HashAlgorithm } from '../../../_lib/crypto'
import { ipHash, jsonError, jsonOk, requireUser } from '../../../_lib/auth'
import { wrap } from '../../../_lib/handler'
import { issueCodes } from '../../../_lib/recovery'

// POST /api/auth/recovery/generate { password }
// Replaces the account's recovery codes. Re-checks the password so a
// borrowed, signed-in phone can't mint itself a permanent way in.
export const onRequestPost: PagesFunction<Env> = wrap<Env>(async ({ request, env }) => {
  const auth = await requireUser(env, request)
  if (auth instanceof Response) return auth

  let body: { password?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid request', 400)
  }
  const password = body.password || ''
  if (!password) return jsonError('Enter your password to continue', 400)

  const row = await env.DB
    .prepare('SELECT password_hash, password_salt, iterations, algorithm FROM users WHERE id = ?')
    .bind(auth.user.id)
    .first<{ password_hash: string; password_salt: string; iterations: number; algorithm: string }>()
  if (!row) return jsonError('Unauthorized', 401)
  const ok = await verifyPassword((row.algorithm as HashAlgorithm) ?? 'pbkdf2', password, row.password_salt, row.password_hash, row.iterations)
  if (!ok) return jsonError('Password is incorrect', 401)

  const codes = await issueCodes(env, auth.user.id)
  await env.DB
    .prepare('INSERT INTO audit_log (user_id, action, meta, ip_hash, at) VALUES (?, ?, ?, ?, ?)')
    .bind(auth.user.id, 'recovery_codes_issued', null, await ipHash(request), Date.now())
    .run()
  return jsonOk({ codes })
})
