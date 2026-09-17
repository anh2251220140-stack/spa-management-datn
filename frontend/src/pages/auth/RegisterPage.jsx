import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { useAuth } from '../../context/authState'
import { registerAccount } from '../../services/authApi'
import { errorMessage } from '../../utils/errorMessage'
import AuthStatus from '../../components/AuthStatus'
export default function RegisterPage() {
  const { user, token, loading, sessionError } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  if (loading || (token && sessionError)) return <AuthStatus />
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/user'} replace />
  function change(event) { setForm({ ...form, [event.target.name]: event.target.value }) }
  async function submit(event) {
    event.preventDefault(); setError('')
    if (!form.full_name.trim() || !form.phone.trim()) return setError('Vui lòng nhập họ tên và số điện thoại.')
    if (form.password.length < 8 || new TextEncoder().encode(form.password).length > 72) return setError('Mật khẩu cần ít nhất 8 ký tự và không vượt quá 72 byte.')
    if (form.password !== form.confirmPassword) return setError('Mật khẩu xác nhận chưa khớp.')
    setSubmitting(true)
    try {
      const email = form.email.trim().toLowerCase()
      await registerAccount({ full_name: form.full_name.trim(), email, phone: form.phone.trim(), password: form.password })
      navigate('/login', { replace: true, state: { registered: true, email } })
    } catch (failure) { setError(errorMessage(failure)) }
    finally { setSubmitting(false) }
  }
  return <section className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-7 shadow-sm sm:p-9"><h1 className="text-3xl font-semibold">Tạo tài khoản</h1><p className="mt-2 text-stone-500">Bắt đầu hành trình chăm sóc bản thân.</p>{error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="block text-sm font-medium">Họ tên<input className="form-input" name="full_name" autoComplete="name" required maxLength={100} value={form.full_name} onChange={change} /></label>
      <label className="block text-sm font-medium">Email<input className="form-input" name="email" type="email" autoComplete="email" required maxLength={255} value={form.email} onChange={change} /></label>
      <label className="block text-sm font-medium">Số điện thoại<input className="form-input" name="phone" type="tel" autoComplete="tel" required maxLength={20} value={form.phone} onChange={change} /></label>
      <label className="block text-sm font-medium">Mật khẩu<input className="form-input" name="password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={change} /><span className="mt-1 block text-xs text-stone-500">Ít nhất 8 ký tự, tối đa 72 byte.</span></label>
      <label className="block text-sm font-medium">Xác nhận mật khẩu<input className="form-input" name="confirmPassword" type="password" autoComplete="new-password" required value={form.confirmPassword} onChange={change} /></label>
      <button className="primary-button w-full" disabled={submitting}><UserPlus size={18} />{submitting ? 'Đang tạo tài khoản…' : 'Đăng ký'}</button>
    </form><p className="mt-6 text-center text-sm text-stone-600">Đã có tài khoản? <Link className="font-semibold text-emerald-800 underline" to="/login">Đăng nhập</Link></p></section>
}
