import type { PagesFunction, Env } from '../../_lib/types'
import { randomToken, verifyPassword } from '../../_lib/crypto'
import { ipHash, jsonError, jsonOk, sessionCookie, sessionTtlMs } from '../../_lib/auth'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid JSON body', 400)
  }
  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''
  if (!email || !password) return jsonError('Email and password required', 400)

  const user = await env.DB
    .prepare(
      `SELECT id, email, password_hash, password_salt, iterations, is_admin, display_name
       FROM users WHERE email = ?`,
    )
    .bind(email)
    .first<{
      id: string
      email: string
      password_hash: string
      password_salt: string
      iterations: number
      is_admin: number
      display_name: string | null
    }>()

  // Constant-time-ish: still attempt a verify even on missing user to avoid trivial timing oracle.
  const ok = user
    ? await verifyPassword(password, user.password_salt, user.password_hash, user.iterations)
    : (await verifyPassword(password, 'AAAAAAAAAAAAAAAAAAAAAA==', 'x', 1000), false)
  if (!user || !ok) {
    return jsonError('Invalid email or password', 401)
  }

  const now = Date.now()
  const token = randomToken()
  const expiresAt = now + sessionTtlMs()
  const ua = request.headers.get('User-Agent')?.slice(0, 200) ?? null
  const iph = await ipHash(request)

  await env.DB
    .prepare(
      `INSERT INTO sessions (token, user_id, expires_at, created_at, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(token, user.id, expiresAt, now, ua, iph)
    .run()

  await env.DB
    .prepare('INSERT INTO audit_log (user_id, action, meta, ip_hash, at) VALUES (?, ?, ?, ?, ?)')
    .bind(user.id, 'login', null, iph, now)
    .run()

  return jsonOk(
    { user: { id: user.id, email: user.email, is_admin: user.is_admin, display_name: user.display_name } },
    { headers: { 'Set-Cookie': sessionCookie(token) } },
  )
}
