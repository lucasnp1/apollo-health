import type { PagesFunction, Env } from '../../_lib/types'
import { sha256Hex } from '../../_lib/crypto'
import { jsonError } from '../../_lib/auth'
import { wrap } from '../../_lib/handler'
import { passwordProblem } from '../../_lib/password'
import { applyNewPasswordAndSignIn } from '../../_lib/passwordReset'

// POST /api/auth/reset { token, password }
// Consumes a reset link (emailed, or issued by an admin from Settings):
// sets the new password, signs every existing session out, and signs the
// user straight in on this device.
const INVALID = 'This reset link is invalid or has expired. Ask for a new one.'

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

  return applyNewPasswordAndSignIn(
    env,
    request,
    user,
    password,
    [env.DB.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').bind(now, tokenHash)],
    'password_reset',
  )
})
