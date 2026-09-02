import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ApiUser, type LoginPayload, type SignupPayload } from './api'
import { wipeAllLocalData } from './lock'

export type AuthState =
  | { status: 'loading' }
  | { status: 'guest' }     // unauthenticated, sign-in screen shown
  | { status: 'authed'; user: ApiUser }

export type ForgotResult = { ok: true; delivery: 'email' | 'unavailable' }

export function useAuth() {
  // DEV ONLY: the dev server has no backend, so set localStorage
  // apollo-dev-authed=1 to enter the app for UI work. Stripped from prod builds.
  const [state, setState] = useState<AuthState>(() =>
    import.meta.env.DEV && localStorage.getItem('apollo-dev-authed') === '1'
      ? { status: 'authed', user: { id: 'dev-user', email: 'dev@local', is_admin: 0, display_name: 'Dev' } }
      : { status: 'loading' },
  )
  const [error, setError] = useState<string>('')
  const fetched = useRef(false)

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    // An account is required. Legacy local-only sessions fall through to the
    // sign-in screen; their on-device data stays in IndexedDB and backfills up
    // to the account on first sync (see runBackfillOnce in sync.ts).
    localStorage.removeItem('apollo-local-mode')
    if (import.meta.env.DEV && localStorage.getItem('apollo-dev-authed') === '1') return
    void (async () => {
      try {
        const me = await api.get<{ user: ApiUser | null }>('/api/auth/me')
        setState(me.user ? { status: 'authed', user: me.user } : { status: 'guest' })
      } catch {
        setState({ status: 'guest' })
      }
    })()
  }, [])

  // After the login/signup POST sets the cookie, fetch /me so the user carries
  // the full server state (plan + onboarded), not just the auth endpoint's
  // partial response.
  async function hydrate(fallback: ApiUser): Promise<ApiUser> {
    try {
      const me = await api.get<{ user: ApiUser | null }>('/api/auth/me')
      return me.user ?? fallback
    } catch {
      return fallback
    }
  }

  const login = useCallback(async (payload: LoginPayload) => {
    setError('')
    try {
      const res = await api.post<{ user: ApiUser }>('/api/auth/login', payload)
      setState({ status: 'authed', user: await hydrate(res.user) })
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
      return false
    }
  }, [])

  const signup = useCallback(async (payload: SignupPayload) => {
    setError('')
    try {
      const res = await api.post<{ user: ApiUser }>('/api/auth/signup', payload)
      setState({ status: 'authed', user: await hydrate(res.user) })
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Signup failed')
      return false
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout')
    } finally {
      setState({ status: 'guest' })
    }
  }, [])

  // Ask for a password-reset email. Never reveals whether the email exists;
  // `delivery` only says whether the server can send mail at all.
  const forgot = useCallback(async (email: string): Promise<ForgotResult | null> => {
    setError('')
    try {
      return await api.post<ForgotResult>('/api/auth/forgot', { email })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the reset link')
      return null
    }
  }, [])

  // Consume a reset link. On success the server signs this device in.
  const resetPassword = useCallback(async (token: string, password: string) => {
    setError('')
    try {
      const res = await api.post<{ user: ApiUser }>('/api/auth/reset', { token, password })
      setState({ status: 'authed', user: await hydrate(res.user) })
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset the password')
      return false
    }
  }, [])

  // Signed-in password change. Throws with a user-facing message on failure.
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await api.post('/api/auth/password', { currentPassword, newPassword })
  }, [])

  // Permanently delete the account server-side, then clear this device.
  // Throws with a user-facing message on failure (wrong password etc).
  const deleteAccount = useCallback(async (password: string) => {
    await api.post('/api/auth/delete', { password })
    try {
      await wipeAllLocalData()
      localStorage.removeItem('apollo.onboarded')
    } catch (e) {
      console.warn('Local wipe after account deletion failed', e)
    }
    setState({ status: 'guest' })
  }, [])

  // Re-fetch the account (e.g. after returning from Stripe checkout) so a plan
  // change is reflected without a full reload.
  const refresh = useCallback(async () => {
    try {
      const me = await api.get<{ user: ApiUser | null }>('/api/auth/me')
      if (me.user) setState({ status: 'authed', user: me.user })
    } catch { /* ignore */ }
  }, [])

  // Effective Pro gate. Defaults to true when the field is absent (billing off
  // or an old server) so we never lock users out on a glitch. DEV can force the
  // free experience to preview paywalls.
  const isPro =
    state.status === 'authed'
      ? import.meta.env.DEV && localStorage.getItem('apollo-dev-free') === '1'
        ? false
        : state.user.is_pro ?? true
      : false

  return { state, error, login, signup, logout, forgot, resetPassword, changePassword, deleteAccount, refresh, isPro }
}
