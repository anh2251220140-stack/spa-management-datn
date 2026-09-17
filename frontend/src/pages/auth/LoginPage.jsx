import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { useAuth } from '../../context/authState'
import { errorMessage } from '../../utils/errorMessage'
import AuthStatus from '../../components/AuthStatus'
export default function LoginPage() {
  const { user, token, loading, sessionError, login } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState(location.state?.email || '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  if (loading || (token && sessionError)) return <AuthStatus />
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/user'} replace />
  async function submit(event) {
    event.preventDefault(); setError(''); setSubmitting(true)
    try { await login({ email: email.trim().toLowerCase(), password }) }
    catch (failure) { setError(errorMessage(failure)) }
    finally { setSubmitting(false) }
  }
  return <section className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-7 shadow-sm sm:p-9"><h1 className="text-3xl font-semibold">Đăng nhập</h1><p className="mt-2 text-stone-500">Rất vui được gặp lại bạn.</p>
    {location.state?.registered && <p role="status" className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Đăng ký thành công. Bạn hãy đăng nhập nhé.</p>}
    {(error || sessionError) && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error || sessionError}</p>}
    <form onSubmit={submit} className="mt-6 space-y-5"><label className="block text-sm font-medium">Email<input className="form-input" type="email" autoComplete="email" required maxLength={255} value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="block text-sm font-medium">Mật khẩu<input className="form-input" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="primary-button w-full" disabled={submitting}><LogIn size={18} />{submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}</button></form>
    <p className="mt-6 text-center text-sm text-stone-600">Chưa có tài khoản? <Link className="font-semibold text-emerald-800 underline" to="/register">Đăng ký</Link></p></section>
}
