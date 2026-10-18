// The web app's shared code (../src/lib) expects a browser. These fill the gaps it hits on iOS.
import * as Crypto from 'expo-crypto'
import { API } from './data/api'

const g = globalThis as Record<string, any>

g.crypto ??= {}
g.crypto.getRandomValues ??= Crypto.getRandomValues
g.crypto.randomUUID ??= Crypto.randomUUID

// The shared code calls its own API with relative paths (/api/search), as a web page can
const fetch0 = g.fetch
g.fetch = (input: unknown, init?: RequestInit) => fetch0(typeof input === 'string' && input.startsWith('/') ? API + input : input, init)

// React Native has no online/offline signal: the shared import queue reads navigator.onLine, and a lookup that fails
// with no signal is retried by the queue anyway
g.navigator ??= {}
g.navigator.onLine ??= true

// fake-indexeddb copies every record with structuredClone. Hermes has none, and the one Expo installs before this
// file runs copies an image a byte at a time (a few ms per cover, on every save and for every cover at launch), so this
// one replaces it. Records are plain data plus image bytes, so this covers them.
const full = g.structuredClone as ((v: unknown) => unknown) | undefined
const clone = (v: any): any => {
  if (v === null || typeof v !== 'object') return v
  if (v instanceof ArrayBuffer) return v.slice(0)
  if (ArrayBuffer.isView(v) && 'slice' in v) return (v as unknown as Uint8Array).slice()
  if (v instanceof Date) return new Date(v)
  if (Array.isArray(v)) return v.map(clone)
  const proto = Object.getPrototypeOf(v)
  if (proto === Object.prototype || proto === null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]))
  // a Map, a Set, a Blob: the full implementation, if there is one
  return full ? full(v) : v
}
g.structuredClone = clone

// Dexie runs on an in-memory IndexedDB; data/persist.ts keeps it on the device. require, not import, so it runs after
// the lines above (imports are hoisted).
require('fake-indexeddb/auto')
// localStorage (the web keeps small view settings there): expo-sqlite's, on the device, never synced
require('expo-sqlite/localStorage/install')
