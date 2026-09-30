import { useEffect, useState } from 'react'
import ReviewReplies from '../../components/ReviewReplies'
import RatingStars from '../../components/RatingStars'
import { getReviews, getReview } from '../../services/reviewApi'
import { errorMessage } from '../../utils/errorMessage'
import { formatPromotionDate } from '../../utils/promotionDisplay'
export default function ReviewManagementPage() {
  const [rows, setRows] = useState([]), [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    getReviews().then(response => { if (active) setRows(response.data.data) }).catch(err => { if (active) setError(errorMessage(err)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  async function open(id) { setBusy(true); setError(''); setDetail(null); try { setDetail((await getReview(id)).data.data) } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) } }
  return <section className="space-y-5"><h1 className="text-3xl font-semibold">Đánh giá dịch vụ</h1>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading ? <p role="status">Đang tải…</p> : <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white"><table className="w-full text-left text-sm"><thead><tr>{['Đánh giá / Lịch hẹn', 'Khách hàng', 'Dịch vụ', 'Số sao', 'Nhận xét', 'Phiên bản', 'Ngày tạo', 'Cập nhật'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr className="border-t border-stone-200" key={row.id}><td className="p-3"><button disabled={busy} className="text-emerald-800 underline" onClick={() => open(row.id)}>#{row.id}</button><p>Lịch #{row.appointment_id}</p></td><td className="p-3">{row.customer_name}</td><td className="p-3">{row.service_name}</td><td className="p-3"><RatingStars value={row.rating} size={18} /></td><td className="max-w-xs truncate p-3">{row.comment || '—'}</td><td className="p-3">{row.content_version}</td><td className="p-3">{formatPromotionDate(row.created_at)}</td><td className="p-3">{formatPromotionDate(row.updated_at)}</td></tr>)}</tbody></table>{!rows.length && <p className="p-5">Chưa có đánh giá.</p>}</div>}
    {detail && <section className="space-y-3 rounded-xl border border-emerald-200 bg-white p-5"><h2 className="text-xl font-semibold">Đánh giá #{detail.id} • Lịch #{detail.appointment_id}</h2><p>{detail.customer_name} • {detail.service_name}</p><div className="flex items-center gap-2"><RatingStars value={detail.rating} /><span>Phiên bản {detail.content_version}</span></div><p className="whitespace-pre-wrap">{detail.comment || 'Không có nhận xét.'}</p><p>Tạo: {formatPromotionDate(detail.created_at)} • Cập nhật: {formatPromotionDate(detail.updated_at)}</p><ReviewReplies key={detail.id} reviewId={detail.id} admin /><button className="underline" onClick={() => setDetail(null)}>Đóng</button></section>}
  </section>
}
