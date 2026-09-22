import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getAppointments, getAppointment, cancelAppointment, updateAppointmentStatus } from '../services/appointmentApi'
import { formatPrice } from '../utils/serviceDisplay'
import { errorMessage } from '../utils/errorMessage'
const labels = { pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', completed: 'Hoàn thành', cancelled: 'Đã hủy' }
const displayTime = value => value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)} ${value.slice(11, 16)}` : ''

export default function AppointmentList({ admin = false }) {
  const location = useLocation()
  const [rows, setRows] = useState([])
  const [detail, setDetail] = useState(null)
  const [date, setDate] = useState('')
  const [status, setStatus] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(location.state?.message || '')
  async function load() { const response = await getAppointments(admin, { ...(date ? { date } : {}), ...(status ? { status } : {}) }); setRows(response.data.data) }
  useEffect(() => {
    let cancelled = false
    getAppointments(admin, {}).then(response => { if (!cancelled) setRows(response.data.data) }).catch(failure => { if (!cancelled) setError(errorMessage(failure)) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [admin])
  async function filter(event) { event.preventDefault(); setLoading(true); setError(''); try { await load() } catch (failure) { setError(errorMessage(failure)) } finally { setLoading(false) } }
  async function open(id) { setBusy(true); setError(''); try { setDetail((await getAppointment(admin, id)).data.data); setReason('') } catch (failure) { setError(errorMessage(failure)) } finally { setBusy(false) } }
  async function change(target) {
    setBusy(true); setError(''); setNotice('')
    try {
      const response = admin ? await updateAppointmentStatus(detail.id, target, reason) : await cancelAppointment(detail.id, reason)
      setDetail(response.data.data); await load(); setNotice('Đã cập nhật lịch hẹn.')
    } catch (failure) { setError(errorMessage(failure)) } finally { setBusy(false) }
  }
  const current = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 19).replace('T', ' ')
  return <section className="space-y-5"><h1 className="text-3xl font-semibold">{admin ? 'Quản lý lịch hẹn' : 'Lịch hẹn của tôi'}</h1>{!admin && <Link className="text-emerald-800 underline" to="/booking">Đặt lịch mới</Link>}
    <p className="text-sm text-stone-500">Ngày giờ theo giờ Việt Nam. Lịch đã hủy hoặc hoàn thành không thể đổi trạng thái.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}{notice && <p role="status" className="text-emerald-800">{notice}</p>}
    <form className="flex flex-wrap items-end gap-3" onSubmit={filter}><label>Ngày<input type="date" className="form-input" value={date} onChange={event => setDate(event.target.value)} /></label><label>Trạng thái<select className="form-input" value={status} onChange={event => setStatus(event.target.value)}><option value="">Tất cả</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button disabled={loading || busy} className="primary-button">Lọc</button></form>
    {loading ? <p role="status">Đang tải…</p> : <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-stone-100"><tr><th className="p-4">Dịch vụ / Nhân viên</th>{admin && <th className="p-4">Khách hàng</th>}<th className="p-4">Ngày giờ</th><th className="p-4">Trạng thái</th><th className="p-4">Chi tiết</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-stone-100"><td className="p-4"><strong>{row.service_name_snapshot}</strong><p>{row.employee_name}</p><p>{formatPrice(row.booked_price)} • {row.duration_minutes} phút</p></td>{admin && <td className="p-4">{row.customer_name}<p>{row.customer_phone}</p></td>}<td className="p-4">{displayTime(row.start_at)}<p>Đến {row.end_at.slice(11, 16)}</p></td><td className="p-4">{labels[row.status]}</td><td className="p-4"><button disabled={busy} className="text-emerald-800 underline" onClick={() => open(row.id)}>Xem #{row.id}</button></td></tr>)}</tbody></table>{!rows.length && <p className="p-5">Chưa có lịch hẹn phù hợp.</p>}</div>}
    {detail && <section className="space-y-3 rounded-2xl border border-emerald-200 bg-white p-6"><div className="flex justify-between gap-3"><h2 className="text-xl font-semibold">Chi tiết lịch #{detail.id}</h2><button disabled={busy} onClick={() => setDetail(null)} className="underline">Đóng</button></div><p>{detail.service_name_snapshot} • {formatPrice(detail.booked_price)} • {detail.duration_minutes} phút</p><p>Nhân viên: {detail.employee_name}</p><p>Khách hàng: {detail.customer_name} • {detail.customer_phone}</p><p>{displayTime(detail.start_at)} – {detail.end_at.slice(11, 16)}</p><p>{labels[detail.status]}</p>{detail.note && <p className="whitespace-pre-wrap">Ghi chú: {detail.note}</p>}{detail.cancelled_at && <p>Hủy lúc {displayTime(detail.cancelled_at)}. {detail.cancel_reason}</p>}
      {['pending', 'confirmed'].includes(detail.status) && <><label className="block">Lý do hủy (nếu có)<input className="form-input" maxLength={255} value={reason} onChange={event => setReason(event.target.value)} /></label><div className="flex flex-wrap gap-3">{admin && detail.status === 'pending' && detail.start_at > current && <button disabled={busy} className="primary-button" onClick={() => change('confirmed')}>Xác nhận lịch</button>}{admin && detail.status === 'confirmed' && detail.end_at <= current && <button disabled={busy} className="primary-button" onClick={() => change('completed')}>Hoàn thành dịch vụ</button>}{(admin || detail.start_at > current) && <button disabled={busy} className="rounded-xl border border-red-300 px-5 py-3 text-red-700" onClick={() => change('cancelled')}>Hủy lịch hẹn</button>}</div></>}
    </section>}
  </section>
}
