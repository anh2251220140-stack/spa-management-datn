import ChatWidget from '../components/ChatWidget'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Leaf, LogOut } from 'lucide-react'
import { useAuth } from '../context/authState'
export default function MainLayout() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const isHome = pathname === '/' || pathname === '/user'
  return <div className={`flex min-h-screen flex-col ${isHome ? 'home-layout' : ''}`}>
    <header className="border-b border-stone-200 bg-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-5">
      <Link to="/" className="flex items-center gap-2 text-xl font-semibold tracking-tight text-emerald-900"><Leaf aria-hidden="true" /> An Nhiên Spa</Link>
      <nav className="flex flex-wrap items-center gap-4 text-sm text-emerald-800">{user?.role !== 'admin' && <><Link to="/services">Dịch vụ</Link><Link to="/promotions">Khuyến mãi</Link></>}{user?.role === 'admin' && <Link to="/admin">Quản trị</Link>}{user?.role === 'user' && <><Link to="/appointments">Lịch hẹn của tôi</Link><Link to="/invoices">Hóa đơn</Link></>}{user && <Link to={user.role === 'admin' ? '/admin/account' : '/account'}>Tài khoản</Link>}{isHome && user?.role !== 'admin' && <Link className="home-booking" to="/booking">Đặt lịch</Link>}</nav>
      {user ? <button onClick={logout} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-stone-100"><LogOut size={17} />Đăng xuất</button> : <Link to="/login" className="text-sm font-medium text-emerald-800">Đăng nhập</Link>}
    </div></header>
    <main className={isHome ? 'w-full flex-1' : 'mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:py-16'}><Outlet /></main>
    <footer className={isHome ? "bg-[#E8D9C6]/60 px-7 py-14 pb-24 text-[#5A4638]" : "px-5 py-6 text-center text-sm text-stone-500"}>{isHome ? <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-10"><div><Link to="/" className="home-brand text-3xl">An Nhiên Spa</Link><p className="mt-4 max-w-xs text-sm leading-7">Không gian chăm sóc và thư giãn dành cho bạn.</p></div><nav aria-label="Liên kết cuối trang" className="flex flex-wrap gap-6 text-sm"><Link to="/services">Dịch vụ</Link><Link to="/promotions">Khuyến mãi</Link><Link to="/booking">Đặt lịch</Link><Link to={user?.role === 'admin' ? '/admin/account' : '/account'}>Tài khoản</Link></nav></div> : 'Không gian chăm sóc và thư giãn dành cho bạn.'}</footer>
    {user?.role !== 'admin' && <ChatWidget key={user?.id ?? 'public'} />}
  </div>
}



