import type { PagesFunction, Env } from '../../_lib/types'
import { derivePasswordHash, randomSalt, randomToken, serializeSalt, uuid } from '../../_lib/crypto'
import { ipHash, jsonError, jsonOk, sessionCookie, sessionTtlMs } from '../../_lib/auth'
import { wrap } from '../../_lib/handler'

export const onRequestPost: PagesFunction<Env> = wrap<Env>(async ({ request, env }) => {
  let body: { email?: string; password?: string; displayName?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''
  const displayName = (body.displayName || '').trim() || null

  if (!email || !email.includes('@')) return jsonError('Valid email required', 400)
  if (password.length < 8) return jsonError('Password must be at least 8 characters', 400)

  // Email uniqueness
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  if (existing) return jsonError('Email already registered', 409)

  // The very first user on a fresh database becomes admin automatically.
  // Everyone after needs to be promoted by an existing admin.
  const userCountRow = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM users')
    .first<{ n: number }>()
  const isAdmin = userCountRow && userCountRow.n === 0 ? 1 : 0

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
    .bind(userId, email, hash, serializeSalt(salt), 100000, isAdmin, displayName, now, now)
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
    .bind(userId, 'signup', JSON.stringify({}), iph, now)
    .run()

  return jsonOk(
    { user: { id: userId, email, is_admin: isAdmin, display_name: displayName } },
    { headers: { 'Set-Cookie': sessionCookie(token) } },
  )
})
