import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ApiUser, type LoginPayload, type SignupPayload } from './api'

export type AuthState =
  | { status: 'loading' }
  | { status: 'guest' }     // unauthenticated, sign-in screen shown
  | { status: 'local' }     // user explicitly chose local-only mode
  | { status: 'authed'; user: ApiUser }

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const [error, setError] = useState<string>('')
  const fetched = useRef(false)

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    // Restore local-only preference across page reloads
    if (localStorage.getItem('apollo-local-mode') === '1') {
      setState({ status: 'local' })
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
      localStorage.removeItem('apollo-local-mode')
      setState({ status: 'guest' })
    }
  }, [])

  const continueAsGuest = useCallback(() => {
    localStorage.setItem('apollo-local-mode', '1')
    setState({ status: 'local' })
  }, [])

  return { state, error, login, signup, logout, continueAsGuest }
}
