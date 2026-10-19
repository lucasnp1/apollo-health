import type { PagesFunction, Env } from '../../_lib/types'
import { exchangeCode, verifyIdentityToken } from '../../_lib/apple'
import { randomToken, uuid } from '../../_lib/crypto'
import { ipHash, jsonError, jsonOk, sessionCookie, sessionTtlMs } from '../../_lib/auth'
import { wrap } from '../../_lib/handler'

// POST /api/auth/apple { identityToken, authorizationCode?, fullName? }
// Sign in with Apple from the iPhone app. The same Apple ID always lands on the same account (apple_sub); the first
// time, an account with the same verified email is linked rather than duplicated, otherwise a new one is made, with no
// password (has_password 0) and so no recovery codes. Apple shares the email only on the very first sign-in, and may
// give a private relay address; with none at all the account gets a placeholder it never sends to.
export const onRequestPost: PagesFunction<Env> = wrap<Env>(async ({ request, env, waitUntil }) => {
  let body: { identityToken?: string; authorizationCode?: string; fullName?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid request', 400)
  }
  const who = body.identityToken ? await verifyIdentityToken(env, body.identityToken) : null
  if (!who) return jsonError("Couldn't confirm your Apple ID. Try again.", 401)

  const now = Date.now()
  const iph = await ipHash(request)
  type Row = { id: string; email: string; is_admin: number; display_name: string | null }
  let user = await env.DB.prepare('SELECT id, email, is_admin, display_name FROM users WHERE apple_sub = ?').bind(who.sub).first<Row>()
  let created = false
  if (!user && who.email && who.emailVerified) {
    user = await env.DB.prepare('SELECT id, email, is_admin, display_name FROM users WHERE email = ?').bind(who.email).first<Row>()
    if (user) await env.DB.prepare('UPDATE users SET apple_sub = ?, updated_at = ? WHERE id = ?').bind(who.sub, now, user.id).run()
  }
  if (!user) {
    const id = uuid()
    const email = who.email ?? `apple-${who.sub.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)}@users.magno.fit`
    const name = (body.fullName || '').trim().slice(0, 80) || null
    // No password: the hash is empty, so a password login can never match it
    await env.DB
      .prepare(
        `INSERT INTO users (id, email, password_hash, password_salt, iterations, is_admin, display_name, algorithm, signup_source, apple_sub, has_password, created_at, updated_at)
         VALUES (?, ?, '', '', 0, 0, ?, 'argon2id', 'ios-apple', ?, 0, ?, ?)`,
      )
      .bind(id, email, name, who.sub, now, now)
      .run()
    user = { id, email, is_admin: 0, display_name: name }
    created = true
  }

  // Kept only to revoke the Apple login if the account is deleted; needs the Sign in with Apple key
  if (body.authorizationCode) {
    const uid = user.id
    waitUntil(
      exchangeCode(env, body.authorizationCode)
        .then((t) => t && env.DB.prepare('UPDATE users SET apple_refresh_token = ? WHERE id = ?').bind(t, uid).run())
        .catch((err) => console.warn('[apple] could not keep the refresh token', err)),
    )
  }

  const token = randomToken()
  await env.DB
    .prepare('INSERT INTO sessions (token, user_id, expires_at, created_at, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(token, user.id, now + sessionTtlMs(), now, request.headers.get('User-Agent')?.slice(0, 200) ?? null, iph)
    .run()
  await env.DB
    .prepare('INSERT INTO audit_log (user_id, action, meta, ip_hash, at) VALUES (?, ?, ?, ?, ?)')
    .bind(user.id, created ? 'signup' : 'login', JSON.stringify({ via: 'apple' }), iph, now)
    .run()

  return jsonOk({ user, created }, { headers: { 'Set-Cookie': sessionCookie(token) } })
})
