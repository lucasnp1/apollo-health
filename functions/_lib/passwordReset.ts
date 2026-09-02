// Shared tail of every password-reset path: store the new hash, sign every
// existing session out, open a fresh session for this device, audit it.

import type { D1PreparedStatement, Env } from './types'
import { deriveArgon2Hash, randomSalt, randomToken, serializeSalt } from './crypto'
import { ipHash, jsonOk, sessionCookie, sessionTtlMs } from './auth'

export type ResetUser = { id: string; email: string; is_admin: number; display_name: string | null }

export async function applyNewPasswordAndSignIn(
  env: Env,
  request: Request,
  user: ResetUser,
  password: string,
  extra: D1PreparedStatement[],
  action: string,
): Promise<Response> {
  const now = Date.now()
  const salt = randomSalt()
  const hash = await deriveArgon2Hash(password, salt)
  const iph = await ipHash(request)
  const token = randomToken()
  const ua = request.headers.get('User-Agent')?.slice(0, 200) ?? null

  await env.DB.batch([
    env.DB
      .prepare(`UPDATE users SET password_hash = ?, password_salt = ?, algorithm = 'argon2id', iterations = 0, updated_at = ? WHERE id = ?`)
      .bind(hash, serializeSalt(salt), now, user.id),
    ...extra,
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').bind(user.id),
    env.DB
      .prepare('INSERT INTO sessions (token, user_id, expires_at, created_at, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(token, user.id, now + sessionTtlMs(), now, ua, iph),
    env.DB
      .prepare('INSERT INTO audit_log (user_id, action, meta, ip_hash, at) VALUES (?, ?, ?, ?, ?)')
      .bind(user.id, action, null, iph, now),
  ])

  return jsonOk(
    { user: { id: user.id, email: user.email, is_admin: user.is_admin, display_name: user.display_name } },
    { headers: { 'Set-Cookie': sessionCookie(token) } },
  )
}
