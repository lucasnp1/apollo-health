// Password hashing + session token primitives.
// Uses WebCrypto only — works inside the Workers runtime.

// Cloudflare Workers caps PBKDF2-SHA256 at 100,000 iterations. Each user's
// iteration count is stored on the row so we can raise it later without
// breaking older accounts.
const ITERATIONS = 100_000
const HASH = 'SHA-256'
const KEY_BITS = 256
const SALT_BYTES = 16

const encoder = new TextEncoder()

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromBase64(value: string): Uint8Array {
  const s = atob(value)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES))
}

export function randomToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return toBase64(bytes).replace(/[+/]/g, (c) => (c === '+' ? '-' : '_')).replace(/=+$/, '')
}

export async function derivePasswordHash(password: string, salt: Uint8Array, iterations = ITERATIONS): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: HASH, salt: salt as BufferSource, iterations },
    keyMaterial,
    KEY_BITS,
  )
  return toBase64(new Uint8Array(bits))
}

export async function verifyPassword(password: string, salt: string, expectedHash: string, iterations: number): Promise<boolean> {
  const computed = await derivePasswordHash(password, fromBase64(salt), iterations)
  return timingSafeEqual(computed, expectedHash)
}

export function serializeSalt(salt: Uint8Array): string {
  return toBase64(salt)
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a)
  const bb = encoder.encode(b)
  const len = Math.max(ab.length, bb.length)
  let diff = ab.length ^ bb.length
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

// SHA-256 hex digest (used for IP fingerprinting only — we never store raw IPs).
export async function sha256Hex(input: string): Promise<string> {
  const bits = await crypto.subtle.digest('SHA-256', encoder.encode(input))
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function uuid(): string {
  return crypto.randomUUID()
}
