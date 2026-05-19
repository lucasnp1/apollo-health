import { db } from './db'

const encoder = new TextEncoder()
const iterations = 210_000
const hashAlgorithm = 'SHA-256'
const saltBytes = 16

export type LockConfig = {
  hash: string
  salt: string
  iterations: number
  idleMinutes: number
}

const keys = {
  hash: 'lock.hash',
  salt: 'lock.salt',
  iterations: 'lock.iterations',
  idleMinutes: 'lock.idleMinutes',
}

export async function getLockConfig(): Promise<LockConfig | undefined> {
  const [hash, salt, storedIterations, idleMinutes] = await db.meta.bulkGet([
    keys.hash,
    keys.salt,
    keys.iterations,
    keys.idleMinutes,
  ])

  if (!hash?.value || !salt?.value) return undefined

  return {
    hash: hash.value,
    salt: salt.value,
    iterations: Number(storedIterations?.value ?? iterations),
    idleMinutes: Number(idleMinutes?.value ?? 5),
  }
}

export async function setLockPassphrase(passphrase: string, idleMinutes = 5) {
  const salt = crypto.getRandomValues(new Uint8Array(saltBytes)) as Uint8Array<ArrayBuffer>
  const hash = await deriveHash(passphrase, salt, iterations)

  await db.transaction('rw', db.meta, async () => {
    await db.meta.bulkPut([
      { key: keys.hash, value: hash },
      { key: keys.salt, value: toBase64(salt) },
      { key: keys.iterations, value: String(iterations) },
      { key: keys.idleMinutes, value: String(idleMinutes) },
    ])
  })
}

export async function updateIdleMinutes(idleMinutes: number) {
  await db.meta.put({ key: keys.idleMinutes, value: String(idleMinutes) })
}

export async function verifyPassphrase(passphrase: string) {
  const config = await getLockConfig()
  if (!config) return false

  const attempted = await deriveHash(passphrase, fromBase64(config.salt), config.iterations)
  return timingSafeEqual(attempted, config.hash)
}

export async function wipeLocalDatabase() {
  await db.transaction('rw', [db.compounds, db.injections, db.vitals, db.exams, db.results, db.files, db.meta], async () => {
    await Promise.all([
      db.compounds.clear(),
      db.injections.clear(),
      db.vitals.clear(),
      db.exams.clear(),
      db.results.clear(),
      db.files.clear(),
      db.meta.clear(),
    ])
  })
}

async function deriveHash(passphrase: string, salt: Uint8Array<ArrayBuffer>, rounds: number) {
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: hashAlgorithm,
      salt,
      iterations: rounds,
    },
    keyMaterial,
    256,
  )

  return toBase64(new Uint8Array(bits))
}

function timingSafeEqual(left: string, right: string) {
  const leftBytes = encoder.encode(left)
  const rightBytes = encoder.encode(right)
  const length = Math.max(leftBytes.length, rightBytes.length)
  let diff = leftBytes.length ^ rightBytes.length

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }

  return diff === 0
}

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)) as Uint8Array<ArrayBuffer>
}
