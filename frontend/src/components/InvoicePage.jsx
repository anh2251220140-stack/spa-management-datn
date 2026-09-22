import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getInvoices, getInvoice, getInvoiceAppointments, createInvoice } from '../services/invoiceApi'
import { getActivePromotions } from '../services/promotionApi'
import { formatPrice } from '../utils/serviceDisplay'
import { formatDiscount, formatPromotionDate } from '../utils/promotionDisplay'
import { errorMessage } from '../utils/errorMessage'
const paymentLabel = status => status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'

export default function InvoicePage({ admin = false }) {
  const { id } = useParams(), navigate = useNavigate()
  const base = admin ? '/admin/invoices' : '/invoices'
  const [rows, setRows] = useState([]), [detail, setDetail] = useState(null)
  const [appointments, setAppointments] = useState([]), [promotions, setPromotions] = useState([])
  const [appointmentId, setAppointmentId] = useState(''), [promotionId, setPromotionId] = useState(''), [note, setNote] = useState('')
  const [paymentStatus, setPaymentStatus] = useState(''), [date, setDate] = useState('')
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true); setError(''); setDetail(null)
      try {
        if (id) {
          const response = await getInvoice(admin, id)
          if (active) setDetail(response.data.data)
        } else {
          const response = await getInvoices(admin)
          if (active) { setRows(response.data.data); setPaymentStatus(''); setDate(''); setAppointmentId(''); setPromotionId(''); setNote('') }
          if (admin) {
            const [available, offers] = await Promise.all([getInvoiceAppointments(), getActivePromotions()])
            if (active) { setAppointments(available.data.data); setPromotions(offers.data.data) }
          }
        }
      } catch (err) { if (active) setError(errorMessage(err)) }
      finally { if (active) setLoading(false) }
    }
    load(); return () => { active = false }
  }, [admin, id])
  async function filter(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { const response = await getInvoices(admin, { ...(paymentStatus ? { payment_status: paymentStatus } : {}), ...(date ? { date } : {}) }); setRows(response.data.data) }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  async function save(event) {
    event.preventDefault(); setError('')
    if (!appointmentId) return setError('Vui lòng chọn lịch hẹn đã hoàn thành.')
    setBusy(true)
    try {
      const response = await createInvoice({ appointment_id: Number(appointmentId), promotion_id: promotionId ? Number(promotionId) : null, note })
      navigate(`${base}/${response.data.data.id}`)
    } catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  const selected = appointments.find(row => row.id === Number(appointmentId))
  return <section className="space-y-5">
    <h1 className="text-3xl font-semibold">{admin ? 'Quản lý hóa đơn' : 'Hóa đơn của tôi'}</h1>
    <p className="text-sm text-stone-500">Ngày giờ theo giờ Việt Nam.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {id && <Link className="text-emerald-800 underline" to={base}>← Danh sách hóa đơn</Link>}
    {loading ? <p role="status">Đang tải hóa đơn…</p> : id ? detail && <section className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-6">
      <h2 className="break-all text-xl font-semibold">{detail.invoice_code}</h2>
      <p>Khách hàng: {detail.customer_name} • {detail.customer_phone}</p>
      <p>Lịch hẹn #{detail.appointment_id}: {formatPromotionDate(detail.appointment_start_at)} – {formatPromotionDate(detail.appointment_end_at)}</p>
      <p>Ngày tạo: {formatPromotionDate(detail.created_at)}</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Dịch vụ','Số lượng','Đơn giá','Thành tiền'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{detail.details.map(row => <tr key={row.id} className="border-t border-stone-200"><td className="p-3">{row.service_name_snapshot}</td><td className="p-3">{row.quantity}</td><td className="p-3">{formatPrice(row.unit_price)}</td><td className="p-3">{formatPrice(row.total_price)}</td></tr>)}</tbody></table></div>
      <p>Tạm tính: {formatPrice(detail.subtotal)}</p>
      <p>Khuyến mãi: {detail.promotion_code_snapshot || 'Không áp dụng'}{detail.promotion_code_snapshot && ` (${detail.discount_type_snapshot === 'percentage' ? Number(detail.discount_value_snapshot) + '%' : formatPrice(detail.discount_value_snapshot)})`}</p>
      {detail.max_discount_snapshot && <p>Mức giảm tối đa: {formatPrice(detail.max_discount_snapshot)}</p>}
      <p>Giảm giá: {formatPrice(detail.discount_amount)}</p>
      <p className="text-xl font-semibold text-emerald-800">Tổng tiền: {formatPrice(detail.total_amount)}</p>
      <p>Trạng thái: {paymentLabel(detail.payment_status)}</p>
      {detail.note && <p className="whitespace-pre-wrap">Ghi chú: {detail.note}</p>}
    </section> : <>
      {admin && <form className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6" onSubmit={save}><h2 className="text-xl font-semibold">Tạo hóa đơn</h2>
        <fieldset disabled={busy} className="space-y-4">
          <label className="block">Lịch hẹn đã hoàn thành<select required className="form-input" value={appointmentId} onChange={event => { setAppointmentId(event.target.value); setPromotionId('') }}><option value="">Chọn lịch hẹn chưa có hóa đơn</option>{appointments.map(row => <option key={row.id} value={row.id}>#{row.id} • {row.customer_name} • {row.service_name_snapshot} • {formatPrice(row.booked_price)}</option>)}</select></label>
          {!appointments.length && <p className="text-sm text-stone-500">Không có lịch hẹn hoàn thành nào đang chờ lập hóa đơn.</p>}
          {selected && <p>Giá dịch vụ khi đặt lịch: <strong>{formatPrice(selected.booked_price)}</strong></p>}
          <label className="block">Khuyến mãi<select className="form-input" value={promotionId} onChange={event => setPromotionId(event.target.value)}><option value="">Không áp dụng</option>{promotions.filter(row => selected && Number(selected.booked_price) >= Number(row.minimum_amount)).map(row => <option key={row.id} value={row.id}>{row.code} • Giảm {formatDiscount(row)}{row.max_discount_amount ? ` • tối đa ${formatPrice(row.max_discount_amount)}` : ''}</option>)}</select></label>
          <p className="text-sm text-stone-500">Khuyến mãi được kiểm tra lại khi tạo hóa đơn. Giảm giá không vượt quá giá dịch vụ.</p>
          <label className="block">Ghi chú<textarea className="form-input" maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></label>
          <button disabled={!selected} className="primary-button">{busy ? 'Đang tạo…' : 'Tạo hóa đơn'}</button>
        </fieldset>
      </form>}
      <form onSubmit={filter} className="flex flex-wrap items-end gap-3"><label>Trạng thái thanh toán<select className="form-input" value={paymentStatus} onChange={event => setPaymentStatus(event.target.value)}><option value="">Tất cả</option><option value="unpaid">Chưa thanh toán</option><option value="paid">Đã thanh toán</option></select></label><label>Ngày tạo<input className="form-input" type="date" value={date} onChange={event => setDate(event.target.value)} /></label><button disabled={busy} className="primary-button">Lọc</button></form>
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-stone-100"><tr>{['Hóa đơn / Lịch hẹn',...(admin ? ['Khách hàng'] : []),'Dịch vụ','Tạm tính','Giảm giá','Tổng tiền','Thanh toán','Ngày tạo'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-stone-100"><td className="p-3"><Link className="text-emerald-800 underline" to={`${base}/${row.id}`}>{row.invoice_code}</Link><p>Lịch #{row.appointment_id}</p></td>{admin && <td className="p-3">{row.customer_name}</td>}<td className="p-3">{row.service_name_snapshot}</td><td className="p-3">{formatPrice(row.subtotal)}</td><td className="p-3">{formatPrice(row.discount_amount)}</td><td className="p-3">{formatPrice(row.total_amount)}</td><td className="p-3">{paymentLabel(row.payment_status)}</td><td className="p-3">{formatPromotionDate(row.created_at)}</td></tr>)}</tbody></table>{!rows.length && <p className="p-5 text-stone-500">Chưa có hóa đơn phù hợp.</p>}</div>
    </>}
  </section>
}
