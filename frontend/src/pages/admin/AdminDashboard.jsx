import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../../context/authState'
export default function AdminDashboard() {
  const { user } = useAuth()
  return <section className="mx-auto max-w-xl rounded-2xl border border-stone-200 bg-white p-8"><ShieldCheck className="mb-5 text-emerald-800" size={32} /><p className="text-sm font-medium text-emerald-800">Khu vực quản trị</p><h1 className="mt-2 text-3xl font-semibold">Xin chào Admin!</h1><p className="mt-4 text-stone-600">Bạn đã đăng nhập với quyền quản trị viên.</p><p className="mt-6 break-all rounded-xl bg-stone-50 p-4">{user.email}</p><p className="mt-6 text-sm text-stone-500">Đây là trang chào ban đầu. Chức năng quản lý và thống kê sẽ được bổ sung sau.</p></section>
}
