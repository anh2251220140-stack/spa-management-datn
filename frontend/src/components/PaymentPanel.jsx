import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { createPayment, getInvoice } from '../services/invoiceApi'
import { pollInvoice } from '../utils/pollInvoice'
import { formatPrice } from '../utils/serviceDisplay'
import { errorMessage } from '../utils/errorMessage'

export default function PaymentPanel({ invoice, onPaid }) {
  const [clock, setClock] = useState(Date.now)
  const endAt = Date.parse((invoice.appointment_end_at || '').replace(' ', 'T') + '+07:00')
  const ended = !Number.isFinite(endAt) || clock >= endAt
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const [payment, setPayment] = useState(null)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (payment?.status !== 'pending') return
    return pollInvoice(async signal => (await getInvoice(false, invoice.id, signal)).data.data, (status, updated) => {
      if (status === 'paid') return onPaid(updated)
      setNotice(status === 'timeout' ? 'Chưa nhận được xác nhận thanh toán. Bạn có thể tải lại hóa đơn để kiểm tra.' : status === 'cancelled' ? 'Thanh toán đã bị hủy.' : status === 'failed' ? 'Thanh toán không thành công.' : 'Không thể kiểm tra hóa đơn. Vui lòng đăng nhập hoặc tải lại trang.')
      if (['cancelled', 'failed'].includes(status)) setPayment(null)
    })
  }, [payment, invoice.id, onPaid])
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function start() {
    if (!Number.isFinite(endAt) || Date.now() >= endAt) { setClock(Date.now()); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await createPayment(invoice.id)
      setPayment(response.data.payment)
      try { localStorage.setItem(`paymentInvoice:${response.data.payment.order_code}`, String(invoice.id)) } catch { /* Trình duyệt có thể chặn storage. */ }
    }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  if (ended) return <p role="status" className="border-t border-stone-200 pt-4 text-amber-800">Lịch hẹn đã kết thúc. Thanh toán online không còn khả dụng.</p>
  return <section className="space-y-3 border-t border-stone-200 pt-4">
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {notice && <p role="status" className="text-amber-800">{notice}</p>}
    {!payment ? <button className="primary-button" disabled={busy || Number(invoice.total_amount) <= 0} onClick={start}>{busy ? 'Đang tạo thanh toán…' : 'Thanh toán'}</button> : <>
      <h3 className="text-lg font-semibold">Chờ thanh toán</h3>
      <p className="break-all">Hóa đơn: {invoice.invoice_code}</p>
      <p>Số tiền: <strong>{formatPrice(payment.amount)}</strong></p>
      {payment.qr_code ? <QRCodeSVG value={payment.qr_code} size={240} marginSize={4} title="Mã QR thanh toán hóa đơn" /> : <p>Mở trang thanh toán để xem mã QR.</p>}
      <div className="flex flex-wrap gap-3"><a className="primary-button" href={payment.checkout_url} target="_blank" rel="noopener noreferrer">Mở trang thanh toán</a><button className="secondary-button" onClick={() => setPayment(null)}>Đóng</button></div>
      <p className="text-sm text-stone-500">Đóng giao diện không hủy liên kết. Hóa đơn chỉ được xác nhận sau khi hệ thống nhận được xác nhận giao dịch.</p>
    </>}
  </section>
}
