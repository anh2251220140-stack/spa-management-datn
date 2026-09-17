import { useEffect, useState } from 'react'
import { AuthContext } from './authState'
import { loginAccount, getCurrentUser } from '../services/authApi'
import { getToken, saveToken, removeToken, tokenStorageKey } from '../utils/authStorage'
import { errorMessage } from '../utils/errorMessage'
export function AuthProvider({ children }) {
  const [token, setToken] = useState(getToken)
  const [user, setUser] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(Boolean(token))
  const [sessionError, setSessionError] = useState('')
  const [attempt, setAttempt] = useState(0)

  function logout() {
    removeToken(); setToken(null); setUser(null); setCustomer(null); setSessionError(''); setLoading(false)
  }
  async function login(credentials) {
    const { data } = await loginAccount(credentials)
    saveToken(data.data.token)
    setUser(null); setCustomer(null); setSessionError(''); setLoading(true); setToken(data.data.token)
    setAttempt((value) => value + 1)
  }
  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    getCurrentUser(token, controller.signal).then(({ data }) => {
      if (controller.signal.aborted) return
      setUser(data.data.user); setCustomer(data.data.customer); setSessionError('')
    }).catch((error) => {
      if (controller.signal.aborted) return
      if ([401, 403].includes(error.response?.status)) {
        removeToken(); setToken(null); setUser(null); setCustomer(null)
      }
      setSessionError(errorMessage(error))
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [token, attempt])
  useEffect(() => {
    function sync(event) {
      if (event.key !== tokenStorageKey && event.key !== null) return
      const nextToken = getToken()
      setUser(null); setCustomer(null); setSessionError(''); setLoading(Boolean(nextToken)); setToken(nextToken)
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  function retry() { setSessionError(''); setLoading(true); setAttempt((value) => value + 1) }
  return <AuthContext.Provider value={{ user, customer, token, loading, sessionError, login, logout, retry }}>{children}</AuthContext.Provider>
}
