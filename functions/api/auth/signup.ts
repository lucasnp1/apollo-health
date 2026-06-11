import type { PagesFunction, Env } from '../../_lib/types'
import { derivePasswordHash, randomSalt, randomToken, serializeSalt, uuid } from '../../_lib/crypto'
import { ipHash, jsonError, jsonOk, sessionCookie, sessionTtlMs } from '../../_lib/auth'
import { wrap } from '../../_lib/handler'

export const onRequestPost: PagesFunction<Env> = wrap<Env>(async ({ request, env }) => {
  let body: { email?: string; password?: string; displayName?: string; inviteCode?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError('Could not create account', 400)
  }

  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''
  const displayName = (body.displayName || '').trim() || null
  const inviteCode = (body.inviteCode || '').trim().toUpperCase() || null

  // Validation errors are intentionally generic — never disclose whether an
  // email is already registered (prevents email enumeration via signup).
  if (!email || !email.includes('@')) return jsonError('Could not create account', 400)
  if (password.length < 8) return jsonError('Password must be at least 8 characters', 400)

  const now = Date.now()

  // Optional invite code: if supplied, must be unused + unexpired. Atomic
  // single-use enforcement is handled by the UPDATE ... WHERE used_by IS NULL
  // pattern below — wins exactly once even under concurrent claims.
  let inviteValidated = false
  if (inviteCode) {
    const inv = await env.DB
      .prepare(
        `SELECT code, used_by, expires_at FROM invite_codes WHERE code = ?`,
      )
      .bind(inviteCode)
      .first<{ code: string; used_by: string | null; expires_at: number | null }>()
    if (!inv || inv.used_by || (inv.expires_at !== null && inv.expires_at < now)) {
      return jsonError('Invite code invalid or expired', 400)
    }
    inviteValidated = true
  }

  // Email uniqueness check. To avoid disclosing existence, we return the same
  // generic error a malformed signup would produce.
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  if (existing) return jsonError('Could not create account', 400)

  // The very first user on a fresh database becomes admin automatically.
  // Everyone after needs to be promoted by an existing admin.
  const userCountRow = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM users')
    .first<{ n: number }>()
  const isAdmin = userCountRow && userCountRow.n === 0 ? 1 : 0

  // Create user
  const salt = randomSalt()
  const hash = await derivePasswordHash(password, salt)
  const userId = uuid()

  await env.DB
    .prepare(
      `INSERT INTO users (id, email, password_hash, password_salt, iterations, is_admin, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(userId, email, hash, serializeSalt(salt), 100000, isAdmin, displayName, now, now)
    .run()

  // Atomically claim the invite code if one was provided. The WHERE clause
  // guarantees only one signup wins the race even if multiple requests use
  // the same code simultaneously.
  if (inviteValidated) {
    const claimed = await env.DB
      .prepare(
        `UPDATE invite_codes SET used_by = ?, used_at = ?
         WHERE code = ? AND used_by IS NULL
           AND (expires_at IS NULL OR expires_at >= ?)`,
      )
      .bind(userId, now, inviteCode, now)
      .run()
    if (!claimed.meta || (claimed.meta as { changes?: number }).changes !== 1) {
      // Lost the race — invite was consumed concurrently. Roll back the user.
      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run()
      return jsonError('Invite code invalid or expired', 400)
    }
  }

  // Create session
  const token = randomToken()
  const expiresAt = now + sessionTtlMs()
  const ua = request.headers.get('User-Agent')?.slice(0, 200) ?? null
  const iph = await ipHash(request)
  await env.DB
    .prepare(
      `INSERT INTO sessions (token, user_id, expires_at, created_at, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(token, userId, expiresAt, now, ua, iph)
    .run()

  await env.DB
    .prepare('INSERT INTO audit_log (user_id, action, meta, ip_hash, at) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, 'signup', JSON.stringify({}), iph, now)
    .run()

  return jsonOk(
    { user: { id: userId, email, is_admin: isAdmin, display_name: displayName } },
    { headers: { 'Set-Cookie': sessionCookie(token) } },
  )
})
