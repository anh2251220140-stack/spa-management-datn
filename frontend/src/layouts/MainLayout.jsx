import { Link, Outlet } from 'react-router-dom'
import { Leaf, LogOut } from 'lucide-react'
import { useAuth } from '../context/authState'
export default function MainLayout() {
  const { user, logout } = useAuth()
  return <div className="flex min-h-screen flex-col">
    <header className="border-b border-stone-200 bg-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-5">
      <Link to="/" className="flex items-center gap-2 text-xl font-semibold tracking-tight text-emerald-900"><Leaf aria-hidden="true" /> An Nhiên Spa</Link>
      <nav className="flex flex-wrap items-center gap-4 text-sm text-emerald-800">{user?.role !== 'admin' && <Link to="/services">Dịch vụ</Link>}{user?.role === 'admin' && <><Link to="/admin/categories">Danh mục</Link><Link to="/admin/services">Quản lý dịch vụ</Link><Link to="/admin/employees">Nhân viên</Link><Link to="/admin/appointments">Lịch hẹn</Link></>}{user?.role === 'user' && <Link to="/appointments">Lịch hẹn của tôi</Link>}{user && <Link to={user.role === 'admin' ? '/admin/account' : '/account'}>Tài khoản</Link>}</nav>
      {user ? <button onClick={logout} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-stone-100"><LogOut size={17} />Đăng xuất</button> : <Link to="/login" className="text-sm font-medium text-emerald-800">Đăng nhập</Link>}
    </div></header>
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:py-16"><Outlet /></main>
    <footer className="px-5 py-6 text-center text-sm text-stone-500">Không gian chăm sóc và thư giãn dành cho bạn.</footer>
  </div>
}
