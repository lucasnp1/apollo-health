// An RS256 JWT checked against a provider's published keys (Apple, Google): the signature only. The caller checks the
// claims (issuer, audience, expiry). Keys are cached for an hour and re-fetched once when a token names an unknown key
// (the provider rotated them). Web Crypto only.
type Jwk = JsonWebKey & { kid: string }
const cache = new Map<string, { at: number; list: Jwk[] }>()

async function keysFrom(url: string, force = false): Promise<Jwk[]> {
  const hit = cache.get(url)
  if (!force && hit && Date.now() - hit.at < 3_600_000) return hit.list
  const res = await fetch(url)
  if (!res.ok) throw new Error(`keys ${res.status} from ${url}`)
  const list = ((await res.json()) as { keys: Jwk[] }).keys
  cache.set(url, { at: Date.now(), list })
  return list
}

export const b64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0))
const part = (s: string) => JSON.parse(new TextDecoder().decode(b64url(s)))

/** The token's claims when its signature is good, otherwise null. */
export async function verifyRs256<C>(token: string, keysUrl: string): Promise<C | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  let header: { kid?: string; alg?: string }
  let claims: C
  try {
    header = part(parts[0])
    claims = part(parts[1])
  } catch {
    return null
  }
  if (header.alg !== 'RS256' || !header.kid) return null
  let jwk = (await keysFrom(keysUrl)).find((k) => k.kid === header.kid)
  if (!jwk) jwk = (await keysFrom(keysUrl, true)).find((k) => k.kid === header.kid)
  if (!jwk) return null
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))
  return ok ? claims : null
}
