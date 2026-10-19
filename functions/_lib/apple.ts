// Sign in with Apple on the server: check the identity token the iPhone sends (Apple's signature, issuer, audience,
// expiry), and, when the Sign in with Apple key is configured, turn the one-time authorization code into a refresh
// token so the login can be revoked when the account is deleted (App Review 5.1.1(v)). No SDK: Web Crypto only.
import type { Env } from './types'
import { verifyRs256 } from './jwt'

const ISSUER = 'https://appleid.apple.com'
const bundleId = (env: Env) => env.APPLE_BUNDLE_ID || 'app.magno.ios'

export type AppleIdentity = { sub: string; email?: string; emailVerified: boolean }

/** The person in a valid identity token, or null. */
export async function verifyIdentityToken(env: Env, token: string): Promise<AppleIdentity | null> {
  const claims = await verifyRs256<{ iss?: string; aud?: string | string[]; exp?: number; sub?: string; email?: string; email_verified?: boolean | string }>(
    token,
    `${ISSUER}/auth/keys`,
  )
  if (!claims) return null
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (claims.iss !== ISSUER || !aud.includes(bundleId(env)) || !claims.sub || !claims.exp || claims.exp * 1000 < Date.now()) return null
  return {
    sub: claims.sub,
    email: claims.email?.toLowerCase(),
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
  }
}

/** True when the Sign in with Apple key is set (Pages secrets APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY). */
export const appleKeyConfigured = (env: Env) => !!(env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY)

const enc = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

/** The client secret Apple's token endpoints want: an ES256 JWT signed with the .p8 key. */
async function clientSecret(env: Env): Promise<string> {
  const pem = env.APPLE_PRIVATE_KEY!.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const now = Math.floor(Date.now() / 1000)
  const input = `${enc({ alg: 'ES256', kid: env.APPLE_KEY_ID })}.${enc({ iss: env.APPLE_TEAM_ID, iat: now, exp: now + 300, aud: ISSUER, sub: bundleId(env) })}`
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input)))
  return `${input}.${btoa(String.fromCharCode(...sig)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}`
}

/** Turns the app's one-time authorization code into a refresh token (null without the key or on failure). */
export async function exchangeCode(env: Env, code: string): Promise<string | null> {
  if (!appleKeyConfigured(env)) return null
  const res = await fetch(`${ISSUER}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: bundleId(env), client_secret: await clientSecret(env), code, grant_type: 'authorization_code' }),
  })
  if (!res.ok) {
    console.warn('[apple] code exchange failed', res.status, await res.text().catch(() => ''))
    return null
  }
  return ((await res.json()) as { refresh_token?: string }).refresh_token ?? null
}

/** Revokes the Apple login, so the app no longer shows under Settings > Apple ID > Sign in with Apple. */
export async function revokeToken(env: Env, refreshToken: string): Promise<void> {
  if (!appleKeyConfigured(env)) return
  const res = await fetch(`${ISSUER}/auth/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: bundleId(env), client_secret: await clientSecret(env), token: refreshToken, token_type_hint: 'refresh_token' }),
  })
  if (!res.ok) console.warn('[apple] revoke failed', res.status)
}
