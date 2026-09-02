import type { PagesFunction, Env } from '../../_lib/types'
import { randomToken, sha256Hex } from '../../_lib/crypto'
import { ipHash, jsonError, jsonOk, requireAdmin } from '../../_lib/auth'
import { wrap } from '../../_lib/handler'

// POST /api/admin/reset-link { email }
// Support tool: an admin creates a one-time reset link for a user who lost
// both their password and their recovery codes, and sends it to them by
// hand. Valid for 24 hours; the user picks the new password themselves.
const TTL_MS = 24 * 60 * 60 * 1000

export const onRequestPost: PagesFunction<Env> = wrap<Env>(async ({ request, env }) => {
  const auth = await requireAdmin(env, request)
  if (auth instanceof Response) return auth

  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid request', 400)
  }
  const email = (body.email || '').trim().toLowerCase()
  if (!email) return jsonError('Enter the account email', 400)

  const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>()
  if (!user) return jsonError('No account with that email', 404)

  const now = Date.now()
  const token = randomToken(32)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').bind(user.id),
    env.DB
      .prepare('INSERT INTO password_resets (token_hash, user_id, expires_at, created_at, ip_hash) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha256Hex(token), user.id, now + TTL_MS, now, await ipHash(request)),
    env.DB
      .prepare('INSERT INTO audit_log (user_id, action, meta, ip_hash, at) VALUES (?, ?, ?, ?, ?)')
      .bind(auth.user.id, 'admin_reset_link', JSON.stringify({ target: user.id }), await ipHash(request), now),
  ])

  const origin = (env.APP_URL || new URL(request.url).origin).replace(/\/$/, '')
  return jsonOk({ link: `${origin}/app/reset?token=${encodeURIComponent(token)}`, expiresAt: now + TTL_MS })
})
