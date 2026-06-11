// Password hashing + session token primitives.
//
// Algorithms supported:
//   - 'argon2id' — default for all new signups (Phase 3). Memory-hard,
//     OWASP-recommended (m=19456 KiB, t=2, p=1, output 32 bytes).
//   - 'pbkdf2'   — legacy. Existing users still authenticate via this
//     path; on the next successful login we transparently rehash to
//     Argon2id. Cloudflare Workers caps PBKDF2-SHA256 at 100k iterations
//     so we can't simply bump it.

import { argon2idAsync } from '@noble/hashes/argon2.js'

export type HashAlgorithm = 'pbkdf2' | 'argon2id'

// PBKDF2 (legacy verification path only — new users use Argon2)
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_HASH = 'SHA-256'
const PBKDF2_KEY_BITS = 256

// Argon2id parameters. Defaults follow OWASP 2024 guidance for
// interactive logins. Tunable upward if CPU budget allows; bumping
// these means a longer wait per signup/login.
const ARGON2_T = 2
const ARGON2_M = 19_456 // KiB (~19 MiB)
const ARGON2_P = 1
const ARGON2_DK_LEN = 32

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

// ── Argon2id (preferred) ────────────────────────────────────────────────

export async function deriveArgon2Hash(password: string, salt: Uint8Array): Promise<string> {
  const out = await argon2idAsync(password, salt, {
    t: ARGON2_T,
    m: ARGON2_M,
    p: ARGON2_P,
    dkLen: ARGON2_DK_LEN,
  })
  return toBase64(out)
}

// ── PBKDF2 (legacy verification only) ──────────────────────────────────

export async function derivePbkdf2Hash(
  password: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: PBKDF2_HASH, salt: salt as BufferSource, iterations },
    keyMaterial,
    PBKDF2_KEY_BITS,
  )
  return toBase64(new Uint8Array(bits))
}

// Legacy export name kept so existing imports keep compiling. New code
// should call deriveArgon2Hash directly.
export const derivePasswordHash = derivePbkdf2Hash

// ── Unified verify (dispatches on algorithm) ───────────────────────────

export async function verifyPassword(
  algorithm: HashAlgorithm,
  password: string,
  salt: string,
  expectedHash: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<boolean> {
  const saltBytes = fromBase64(salt)
  let computed: string
  if (algorithm === 'argon2id') {
    computed = await deriveArgon2Hash(password, saltBytes)
  } else {
    computed = await derivePbkdf2Hash(password, saltBytes, iterations)
  }
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
