import { Link, Navigate } from 'react-router-dom'
import { ArrowRight, Leaf } from 'lucide-react'
import { useAuth } from '../../context/authState'
import AuthStatus from '../../components/AuthStatus'
export default function HomePage() {
  const { user, token, loading, sessionError } = useAuth()
  if (loading || (token && sessionError)) return <AuthStatus />
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/user'} replace />
  return <section className="mx-auto max-w-2xl rounded-3xl border border-emerald-100 bg-emerald-50 p-8 text-center sm:p-16"><Leaf className="mx-auto mb-6 text-emerald-800" size={40} /><p className="text-sm font-semibold uppercase tracking-widest text-emerald-800">Chào mừng bạn</p><h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight">Một khoảng lặng,<br />dành riêng cho bạn.</h1><p className="mt-5 leading-7 text-stone-600">Đăng nhập hoặc tạo tài khoản để bắt đầu cùng An Nhiên Spa.</p><div className="mt-8 flex flex-wrap justify-center gap-4"><Link to="/login" className="primary-button">Đăng nhập <ArrowRight size={18} /></Link><Link to="/register" className="rounded-xl border border-emerald-800 px-5 py-3 font-semibold text-emerald-900">Tạo tài khoản</Link></div></section>
}
