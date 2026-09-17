import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/authState'
import AuthStatus from '../components/AuthStatus'
export default function ProtectedRoute({ role }) {
  const { user, token, loading, sessionError } = useAuth()
  if (loading || (token && sessionError)) return <AuthStatus />
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <section className="rounded-2xl border border-stone-200 bg-white p-8 text-center"><h1 className="text-2xl font-semibold">Bạn không có quyền truy cập</h1><p className="my-4 text-stone-600">Trang này dành cho vai trò khác.</p><a className="primary-button" href={user.role === 'admin' ? '/admin' : '/user'}>Về trang của tôi</a></section>
  return <Outlet />
}
