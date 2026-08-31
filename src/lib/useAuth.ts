import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ApiUser, type LoginPayload, type SignupPayload } from './api'

export type AuthState =
  | { status: 'loading' }
  | { status: 'guest' }     // unauthenticated, sign-in screen shown
  | { status: 'authed'; user: ApiUser }

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const [error, setError] = useState<string>('')
  const fetched = useRef(false)

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    // An account is required. Legacy local-only sessions fall through to the
    // sign-in screen; their on-device data stays in IndexedDB and backfills up
    // to the account on first sync (see runBackfillOnce in sync.ts).
    localStorage.removeItem('apollo-local-mode')
    // DEV ONLY: the dev server has no backend, so set localStorage
    // apollo-dev-authed=1 to enter the app for UI work. Stripped from prod builds.
    if (import.meta.env.DEV && localStorage.getItem('apollo-dev-authed') === '1') {
      setState({ status: 'authed', user: { id: 'dev-user', email: 'dev@local', is_admin: 0, display_name: 'Dev' } })
      return
    }
    void (async () => {
      try {
        const me = await api.get<{ user: ApiUser | null }>('/api/auth/me')
        setState(me.user ? { status: 'authed', user: me.user } : { status: 'guest' })
      } catch {
        setState({ status: 'guest' })
      }
    })()
  }, [])

  const login = useCallback(async (payload: LoginPayload) => {
    setError('')
    try {
      const res = await api.post<{ user: ApiUser }>('/api/auth/login', payload)
      setState({ status: 'authed', user: res.user })
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
      setState({ status: 'authed', user: res.user })
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

  return { state, error, login, signup, logout }
}
