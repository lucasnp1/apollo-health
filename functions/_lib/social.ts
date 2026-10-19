// Signing in with Apple or Google, after the provider's token was checked: the same provider account always lands on
// the same Magno account (apple_sub / google_sub); the first time, an account with the same verified email is linked
// instead of duplicated, otherwise a new one is made with no password (has_password 0, so no recovery codes). Then a
// session, as a password login makes.
import type { Env } from './types'
import { randomToken, uuid } from './crypto'
import { ipHash, jsonOk, sessionCookie, sessionTtlMs } from './auth'

export type Provider = 'apple' | 'google'
type Row = { id: string; email: string; is_admin: number; display_name: string | null }

export async function socialSignIn(env: Env, request: Request, provider: Provider, who: { sub: string; email?: string; emailVerified: boolean }) {
  const col = provider === 'apple' ? 'apple_sub' : 'google_sub'
  const now = Date.now()
  const iph = await ipHash(request)
  let user = await env.DB.prepare(`SELECT id, email, is_admin, display_name FROM users WHERE ${col} = ?`).bind(who.sub).first<Row>()
  let created = false
  if (!user && who.email && who.emailVerified) {
    user = await env.DB.prepare('SELECT id, email, is_admin, display_name FROM users WHERE email = ?').bind(who.email).first<Row>()
    if (user) await env.DB.prepare(`UPDATE users SET ${col} = ?, updated_at = ? WHERE id = ?`).bind(who.sub, now, user.id).run()
  }
  if (!user) {
    const id = uuid()
    // Apple shares the email only the first time; with none at all the account gets a placeholder it never sends to
    const email = who.email ?? `${provider}-${who.sub.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)}@users.magno.fit`
    await env.DB
      .prepare(
        `INSERT INTO users (id, email, password_hash, password_salt, iterations, is_admin, display_name, algorithm, signup_source, ${col}, has_password, created_at, updated_at)
         VALUES (?, ?, '', '', 0, 0, NULL, 'argon2id', ?, ?, 0, ?, ?)`,
      )
      .bind(id, email, `ios-${provider}`, who.sub, now, now)
      .run()
    user = { id, email, is_admin: 0, display_name: null }
    created = true
  }

  const token = randomToken()
  await env.DB
    .prepare('INSERT INTO sessions (token, user_id, expires_at, created_at, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(token, user.id, now + sessionTtlMs(), now, request.headers.get('User-Agent')?.slice(0, 200) ?? null, iph)
    .run()
  await env.DB
    .prepare('INSERT INTO audit_log (user_id, action, meta, ip_hash, at) VALUES (?, ?, ?, ?, ?)')
    .bind(user.id, created ? 'signup' : 'login', JSON.stringify({ via: provider }), iph, now)
    .run()
  return { user, created, response: jsonOk({ user, created }, { headers: { 'Set-Cookie': sessionCookie(token) } }) }
}
