import { useEffect, useState } from 'react'
import { CalendarDays, CalendarCheck, Users, Wallet, Receipt } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getDashboard } from '../../services/dashboardApi'
import { formatPrice } from '../../utils/serviceDisplay'
import { formatPromotionDate } from '../../utils/promotionDisplay'
import { errorMessage } from '../../utils/errorMessage'

const statusLabels = { pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', completed: 'Hoàn thành', cancelled: 'Đã hủy' }
const panel = 'min-w-0 rounded-2xl border border-stone-200 bg-white p-5'

export default function AdminDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setData(null); setError('')
    getDashboard(controller.signal).then(response => { if (!controller.signal.aborted) setData(response.data.data) })
      .catch(err => { if (!controller.signal.aborted) setError(errorMessage(err)) })
    return () => controller.abort()
  }, [attempt])
  if (error) return <section className={panel}><h1 className="text-2xl font-semibold">Tổng quan quản trị</h1><p role="alert" className="my-4 text-red-700">{error}</p><button className="primary-button" onClick={() => setAttempt(value => value + 1)}>Thử lại</button></section>
  if (!data) return <p role="status">Đang tải thống kê…</p>
  const summary = data.summary
  const cards = [
    ['Tổng lịch hẹn', summary.total_appointments, CalendarDays, 'Toàn thời gian'],
    ['Lịch hẹn hôm nay', summary.today_appointments, CalendarCheck, 'Không gồm lịch đã hủy'],
    ['Tổng khách hàng', summary.total_customers, Users, 'Không gồm tài khoản Admin'],
    ['Doanh thu đã thanh toán', formatPrice(summary.paid_revenue), Wallet, 'Toàn thời gian • Sau giảm giá'],
    ['Hóa đơn chưa thanh toán', summary.unpaid_invoices, Receipt, 'Toàn thời gian'],
  ]
  const statuses = Object.entries(data.appointment_status).map(([key, count]) => ({ name: statusLabels[key], count }))
  const revenue = data.monthly_revenue.map(row => ({ ...row, amount: Number(row.revenue) }))
  return <section className="space-y-6">
    <header><p className="text-sm font-medium text-emerald-800">An Nhiên Spa</p><h1 className="mt-1 text-3xl font-semibold">Tổng quan quản trị</h1><p className="mt-2 text-sm text-stone-500">Cập nhật: {formatPromotionDate(data.generated_at)} • Giờ Việt Nam</p></header>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      {cards.map(([label, value, Icon, note]) => <article key={label} className={panel}><Icon size={22} className="mb-3 text-emerald-700" aria-hidden="true" /><h2 className="text-sm text-stone-600">{label}</h2><p className="mt-2 break-words text-2xl font-semibold text-emerald-900">{value}</p><p className="mt-2 text-xs text-stone-500">{note}</p></article>)}
    </div>
    <div className="grid gap-6 xl:grid-cols-2">
      <section className={panel}><h2 className="text-lg font-semibold">Lịch hẹn theo trạng thái</h2><p className="mb-4 text-sm text-stone-500">Toàn thời gian</p>
        {!summary.total_appointments && <p className="text-sm text-stone-500">Chưa có lịch hẹn.</p>}
        <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={statuses} margin={{ top: 24, right: 8, left: -15, bottom: 10 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" name="Số lịch" fill="#047857" radius={[4, 4, 0, 0]} label={{ position: 'top' }} /></BarChart></ResponsiveContainer></div>
      </section>
      <section className={panel}><h2 className="text-lg font-semibold">Doanh thu 6 tháng gần nhất</h2><p className="mb-4 text-sm text-stone-500">Theo ngày thanh toán • Tháng hiện tại chưa kết thúc</p>
        {revenue.every(row => row.amount === 0) && <p className="text-sm text-stone-500">Chưa có doanh thu trong khoảng này.</p>}
        <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={revenue} margin={{ top: 16, right: 8, left: 0, bottom: 10 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis width={65} tick={{ fontSize: 11 }} tickFormatter={value => new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(value)} /><Tooltip formatter={value => formatPrice(value)} /><Bar dataKey="amount" name="Doanh thu" fill="#047857" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
      </section>
    </div>
    <section className={panel}><h2 className="text-lg font-semibold">Top 5 dịch vụ được sử dụng</h2><p className="mb-4 text-sm text-stone-500">Lượt phục vụ đã hoàn thành • Toàn thời gian</p>
      {!data.top_services.length ? <p className="text-stone-500">Chưa có dịch vụ được sử dụng.</p> : <ol className="divide-y divide-stone-100">{data.top_services.map((service, index) => <li key={service.service_id} className="flex items-center justify-between gap-4 py-3"><span>{index + 1}. {service.service_name}</span><span className="shrink-0 font-semibold text-emerald-800">{service.usage_count} lượt</span></li>)}</ol>}
    </section>
    <section className={panel}><h2 className="mb-4 text-lg font-semibold">Lịch hẹn mới được tạo</h2>
      {!data.recent_appointments.length ? <p className="text-stone-500">Chưa có lịch hẹn.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Mã lịch', 'Khách hàng', 'Dịch vụ', 'Nhân viên', 'Thời gian phục vụ', 'Trạng thái'].map(label => <th key={label} className="whitespace-nowrap border-b border-stone-200 p-3">{label}</th>)}</tr></thead><tbody>{data.recent_appointments.map(item => <tr key={item.id} className="border-b border-stone-100"><td className="p-3">#{item.id}</td><td className="p-3">{item.customer_name}</td><td className="p-3">{item.service_name_snapshot}</td><td className="p-3">{item.employee_name}</td><td className="whitespace-nowrap p-3">{formatPromotionDate(item.start_at)}<br /><span className="text-stone-500">Đến {formatPromotionDate(item.end_at)}</span></td><td className="whitespace-nowrap p-3">{statusLabels[item.status]}</td></tr>)}</tbody></table></div>}
    </section>
  </section>
}
