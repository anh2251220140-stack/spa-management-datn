import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Leaf, LayoutDashboard, FolderTree, Sparkles, Users, CalendarDays, Tags, Receipt, Star, UserRound, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '../context/authState'

const items = [
  ['/admin', 'Dashboard', LayoutDashboard],
  ['/admin/categories', 'Danh mục', FolderTree],
  ['/admin/services', 'Quản lý dịch vụ', Sparkles],
  ['/admin/employees', 'Nhân viên', Users],
  ['/admin/appointments', 'Lịch hẹn', CalendarDays],
  ['/admin/promotions', 'Khuyến mãi', Tags],
  ['/admin/invoices', 'Hóa đơn', Receipt],
  ['/admin/reviews', 'Đánh giá', Star],
  ['/admin/account', 'Tài khoản', UserRound],
]

export default function AdminLayout() {
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)
  return <div className="min-h-screen bg-stone-50">
    <header className="flex items-center justify-between border-b border-stone-200 bg-white p-4 md:hidden">
      <Link to="/admin" className="flex items-center gap-2 font-semibold text-emerald-900"><Leaf aria-hidden="true" />An Nhiên Spa</Link>
      <button type="button" aria-label={open ? 'Đóng menu quản trị' : 'Mở menu quản trị'} aria-expanded={open} aria-controls="admin-sidebar" onClick={() => setOpen(!open)} className="rounded-lg p-2 text-emerald-800">{open ? <X /> : <Menu />}</button>
    </header>
    <aside id="admin-sidebar" className={`${open ? 'flex' : 'hidden'} flex-col border-r border-stone-200 bg-white md:fixed md:inset-y-0 md:left-0 md:flex md:w-60 md:overflow-y-auto`}>
      <Link to="/admin" onClick={() => setOpen(false)} className="flex items-center gap-3 border-b border-stone-100 p-6 text-emerald-900">
        <Leaf size={28} aria-hidden="true" /><span><span className="block text-lg font-semibold">An Nhiên Spa</span><span className="text-xs text-stone-500">Quản trị</span></span>
      </Link>
      <nav aria-label="Menu quản trị" className="flex-1 space-y-1 p-3">
        {items.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === '/admin'} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium ${isActive ? 'bg-emerald-50 text-emerald-900 ring-1 ring-inset ring-emerald-200' : 'text-stone-600 hover:bg-stone-50 hover:text-emerald-800'}`}><Icon size={19} aria-hidden="true" />{label}</NavLink>)}
      </nav>
      <div className="border-t border-stone-100 p-3"><button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-stone-600 hover:bg-stone-100"><LogOut size={19} aria-hidden="true" />Đăng xuất</button></div>
    </aside>
    <main className="min-w-0 p-4 sm:p-6 md:ml-60 lg:p-8"><Outlet /></main>
  </div>
}
