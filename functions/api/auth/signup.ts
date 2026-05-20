import type { PagesFunction, Env } from '../../_lib/types'
import { derivePasswordHash, randomSalt, randomToken, serializeSalt, uuid } from '../../_lib/crypto'
import { ipHash, jsonError, jsonOk, sessionCookie, sessionTtlMs } from '../../_lib/auth'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { email?: string; password?: string; invite?: string; displayName?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''
  const invite = (body.invite || '').trim().toUpperCase()
  const displayName = (body.displayName || '').trim() || null

  if (!email || !email.includes('@')) return jsonError('Valid email required', 400)
  if (password.length < 8) return jsonError('Password must be at least 8 characters', 400)
  if (!invite) return jsonError('Invite code required', 400)

  // Validate invite (unused, not expired)
  const inviteRow = await env.DB
    .prepare('SELECT code, used_by, expires_at FROM invite_codes WHERE code = ?')
    .bind(invite)
    .first<{ code: string; used_by: string | null; expires_at: number | null }>()
  if (!inviteRow) return jsonError('Unknown invite code', 400)
  if (inviteRow.used_by) return jsonError('Invite code already used', 400)
  if (inviteRow.expires_at && inviteRow.expires_at < Date.now()) return jsonError('Invite code expired', 400)

  // Email uniqueness
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  if (existing) return jsonError('Email already registered', 409)

  // Create user
  const salt = randomSalt()
  const hash = await derivePasswordHash(password, salt)
  const now = Date.now()
  const userId = uuid()

  await env.DB
    .prepare(
      `INSERT INTO users (id, email, password_hash, password_salt, iterations, is_admin, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(userId, email, hash, serializeSalt(salt), 210000, 0, displayName, now, now)
    .run()

  // Burn the invite
  await env.DB
    .prepare('UPDATE invite_codes SET used_by = ?, used_at = ? WHERE code = ?')
    .bind(userId, now, invite)
    .run()

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
    .bind(userId, 'signup', JSON.stringify({ invite }), iph, now)
    .run()

  return jsonOk(
    { user: { id: userId, email, is_admin: 0, display_name: displayName } },
    { headers: { 'Set-Cookie': sessionCookie(token) } },
  )
}
