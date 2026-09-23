import { Link, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getInvoice } from '../../services/invoiceApi'
import { pollInvoice } from '../../utils/pollInvoice'
export default function PaymentReturnPage({ cancelled = false }) {
  const [result, setResult] = useState(null)
  const [params] = useSearchParams()
  const orderCode = params.get('orderCode')
  const status = result?.orderCode === orderCode ? result.status : 'pending'
  useEffect(() => {
    if (cancelled) return
    let id
    if (!/^[1-9]\d*$/.test(orderCode || '')) return
    // Query chỉ chọn bản ghi đã lưu; trạng thái paid luôn phải do API xác nhận.
    try { id = localStorage.getItem(`paymentInvoice:${orderCode}`) } catch { return }
    if (!/^[1-9]\d*$/.test(id || '')) return
    return pollInvoice(async signal => (await getInvoice(false, id, signal)).data.data, status => setResult({ orderCode, status }))
  }, [cancelled, orderCode])
  return <section className="space-y-4 rounded-2xl bg-white p-6">
    <h1 role="status" className={`text-2xl font-semibold ${!cancelled && status === 'paid' ? 'rounded-xl bg-emerald-50 p-4 text-emerald-800' : ''}`}>{cancelled ? 'Đã quay lại từ trang thanh toán' : status === 'paid' ? 'Thanh toán thành công' : 'Đang chờ xác nhận giao dịch...'}</h1>
    <p>{cancelled ? 'Bạn đã hủy hoặc quay lại từ cổng thanh toán. Trạng thái hóa đơn chưa thay đổi.' : status === 'paid' ? 'Hóa đơn đã được thanh toán thành công.' : status === 'timeout' ? 'Chưa nhận được xác nhận thanh toán. Bạn có thể tải lại hóa đơn để kiểm tra.' : status === 'error' ? 'Đã dừng kiểm tra tự động. Vui lòng mở hóa đơn để kiểm tra trạng thái mới nhất.' : 'Đã quay lại từ cổng thanh toán. Hệ thống đang chờ xác nhận giao dịch.'}</p>
    <Link className="primary-button" to="/invoices">Về hóa đơn của tôi</Link>
  </section>
}
