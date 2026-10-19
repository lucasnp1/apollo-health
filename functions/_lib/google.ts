// Sign in with Google on the server: the ID token the app gets from Google, checked against Google's keys, issuer,
// audience (the app's OAuth client IDs, Pages secret GOOGLE_CLIENT_IDS, comma separated) and expiry.
import type { Env } from './types'
import { verifyRs256 } from './jwt'

export type GoogleIdentity = { sub: string; email?: string; emailVerified: boolean }

export const googleConfigured = (env: Env) => !!env.GOOGLE_CLIENT_IDS?.trim()

export async function verifyGoogleToken(env: Env, token: string): Promise<GoogleIdentity | null> {
  if (!googleConfigured(env)) return null
  const claims = await verifyRs256<{ iss?: string; aud?: string; azp?: string; exp?: number; sub?: string; email?: string; email_verified?: boolean | string }>(
    token,
    'https://www.googleapis.com/oauth2/v3/certs',
  )
  if (!claims) return null
  const ids = env.GOOGLE_CLIENT_IDS!.split(',').map((s) => s.trim()).filter(Boolean)
  const issOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com'
  if (!issOk || !claims.aud || !ids.includes(claims.aud) || !claims.sub || !claims.exp || claims.exp * 1000 < Date.now()) return null
  return { sub: claims.sub, email: claims.email?.toLowerCase(), emailVerified: claims.email_verified === true || claims.email_verified === 'true' }
}
