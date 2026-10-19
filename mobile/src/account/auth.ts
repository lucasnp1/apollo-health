// The Magno account on this phone. Optional: everything works signed out, kept on the phone; signing in backs it up
// and syncs it with magno.fit through the web's own sync engine (account/sync.ts). The server's session cookie is
// kept by iOS's own cookie store, as a browser keeps it. The web's useAuth.ts reads Vite's import.meta.env and wipes
// data its own way, so this is the app's small version of it over the same endpoints.
import * as AppleAuthentication from 'expo-apple-authentication'
import { useSyncExternalStore } from 'react'
import { api, type ApiUser } from '@shared/lib/api'
import { wipeAllLocalData } from '@shared/lib/db'

export type Account = { status: 'loading' } | { status: 'guest' } | { status: 'authed'; user: ApiUser }

// The last account seen, so a launch with no signal still opens signed in (sync just waits for a connection)
const KEY = 'magno.account'
const saved = (): ApiUser | undefined => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? undefined
  } catch {
    return undefined
  }
}

let state: Account = { status: 'loading' }
const subs = new Set<() => void>()
function set(next: Account) {
  state = next
  try {
    if (next.status === 'authed') localStorage.setItem(KEY, JSON.stringify(next.user))
    else if (next.status === 'guest') localStorage.removeItem(KEY)
  } catch {}
  subs.forEach((f) => f())
}

export const useAccount = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => state)
export const account = () => state

const me = async () => (await api.get<{ user: ApiUser | null }>('/api/auth/me')).user

/** At launch: who's signed in, from the server, or the saved account when there's no connection. */
export async function startAccount() {
  const last = saved()
  if (last) set({ status: 'authed', user: last })
  try {
    const user = await me()
    set(user ? { status: 'authed', user } : { status: 'guest' })
  } catch (err) {
    // 401 means the session ended (signed out elsewhere, or expired); anything else is no connection
    if ((err as { status?: number }).status === 401) set({ status: 'guest' })
    else if (!last) set({ status: 'guest' })
  }
}

/** Re-read the account, e.g. its plan after a purchase. */
export async function refreshAccount() {
  const user = await me().catch(() => undefined)
  if (user) set({ status: 'authed', user })
}

const signedIn = async (fallback: ApiUser) => set({ status: 'authed', user: (await me().catch(() => null)) ?? fallback })

export async function signIn(email: string, password: string) {
  const res = await api.post<{ user: ApiUser }>('/api/auth/login', { email: email.trim(), password })
  await signedIn(res.user)
}

/** Asks Apple for the person's identity (Face ID sheet); null when they cancel. */
async function appleCredential() {
  try {
    return await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    })
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null
    throw e
  }
}

/**
 * Sign in with Apple: the same Apple ID always opens the same account; the first time, an account with the same email
 * is used, otherwise one is made, with no password and so no recovery codes. False when the person cancels.
 */
export async function signInWithApple(): Promise<boolean> {
  const c = await appleCredential()
  if (!c?.identityToken) return false
  // The name Apple can share isn't sent: Magno doesn't use it, so it isn't collected
  const res = await api.post<{ user: ApiUser }>('/api/auth/apple', { identityToken: c.identityToken, authorizationCode: c.authorizationCode })
  await signedIn(res.user)
  return true
}

/** Creates the account; the recovery codes are shown once, right after. */
export async function signUp(email: string, password: string): Promise<string[]> {
  const res = await api.post<{ user: ApiUser; recoveryCodes?: string[] }>('/api/auth/signup', { email: email.trim(), password, source: 'ios' })
  await signedIn(res.user)
  return res.recoveryCodes ?? []
}

/** Emails a reset link when the server can send mail ('email'); 'unavailable' means use a recovery code instead. */
export async function requestReset(email: string): Promise<'email' | 'unavailable'> {
  return (await api.post<{ delivery: 'email' | 'unavailable' }>('/api/auth/forgot', { email: email.trim() })).delivery
}

/** A forgotten password, reset with one of the account's recovery codes. Signs this phone in. */
export async function resetWithCode(email: string, code: string, password: string) {
  const res = await api.post<{ user: ApiUser }>('/api/auth/recovery/reset', { email: email.trim(), code: code.trim(), password })
  await signedIn(res.user)
}

/**
 * Sign out, and take this person's data off the phone (it stays in the account): a phone passed to someone else
 * must not show them the last person's health data. What hasn't synced yet goes up first.
 */
export async function signOut(flush: () => Promise<unknown>) {
  await flush()
  await api.post('/api/auth/logout').catch(() => {})
  await wipeAllLocalData()
  set({ status: 'guest' })
}

/** Deletes the account and everything in it on the server, then everything on this phone. Apple 5.1.1(v). */
export async function deleteAccount(password: string) {
  await api.post('/api/auth/delete', { password })
  await wipeAllLocalData()
  set({ status: 'guest' })
}

/** The same, for an account signed in with Apple: Apple confirms it's them instead of a password. False if cancelled. */
export async function deleteAccountWithApple(): Promise<boolean> {
  const c = await appleCredential()
  if (!c?.identityToken) return false
  await api.post('/api/auth/delete', { appleIdentityToken: c.identityToken })
  await wipeAllLocalData()
  set({ status: 'guest' })
  return true
}

/** Change the password; the server signs out every other device, this one stays signed in. */
export const changePassword = (currentPassword: string, newPassword: string) =>
  api.post('/api/auth/password', { currentPassword, newPassword })

/** How many unused recovery codes the account has left. */
export const recoveryStatus = () => api.get<{ remaining: number; total: number }>('/api/auth/recovery/status')

/** Replaces the recovery codes (the old ones stop working). Re-asks the password. */
export const regenerateCodes = async (password: string) =>
  (await api.post<{ codes: string[] }>('/api/auth/recovery/generate', { password })).codes

/** Feedback to the team, stored on the server with the account email. Needs to be signed in. */
export const sendFeedback = (message: string) => api.post('/api/feedback', { message: message.trim() })

export const SUPPORT_EMAIL = 'hello@theos.studio' // the web app's support address
export const mailto = (subject: string, body = '') =>
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
