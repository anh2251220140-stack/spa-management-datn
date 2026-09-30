import { useEffect, useState } from 'react'
import ReviewReplies from './ReviewReplies'
import RatingStars from './RatingStars'
import { createReview, getOwnReview, updateReview } from '../services/reviewApi'
import { errorMessage } from '../utils/errorMessage'
export default function ReviewPanel({ appointmentId }) {
  const [review, setReview] = useState(null), [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false)
  const [rating, setRating] = useState('5'), [comment, setComment] = useState('')
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    getOwnReview(appointmentId).then(response => { if (active) setReview(response.data.data) })
      .catch(err => { if (active) setError(errorMessage(err)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [appointmentId])
  function open() { setRating(String(review?.rating || 5)); setComment(review?.comment || ''); setEditing(true); setError(''); setNotice('') }
  async function save(event) {
    event.preventDefault(); setError(''); setNotice('')
    if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5 || comment.trim().length > 2000) return setError('Chọn 1–5 sao và nhận xét tối đa 2000 ký tự.')
    setBusy(true)
    try {
      const data = { rating: Number(rating), comment: comment.trim() || null }
      const response = review ? await updateReview(review.id, data) : await createReview({ ...data, appointment_id: appointmentId })
      setReview(response.data.data); setEditing(false); setNotice('Đã lưu đánh giá.')
    } catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  if (loading) return <p role="status">Đang tải đánh giá…</p>
  return <section className="space-y-3 border-t border-stone-200 pt-4">
    <h3 className="text-lg font-semibold">Đánh giá dịch vụ</h3>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {notice && <p role="status" className="text-emerald-800">{notice}</p>}
    {review && <div><RatingStars value={review.rating} /><p className="whitespace-pre-wrap">{review.comment || 'Không có nhận xét.'}</p></div>}
    {editing ? <form onSubmit={save} className="space-y-3"><fieldset disabled={busy} className="space-y-3">
      <div><p>Số sao</p><RatingStars value={rating} interactive onChange={setRating} size={28} disabled={busy} /></div>
      <label className="block">Nhận xét (không bắt buộc)<textarea className="form-input" maxLength={2000} value={comment} onChange={event => setComment(event.target.value)} /></label>
      <div className="flex gap-3"><button className="primary-button">{busy ? 'Đang lưu…' : 'Lưu đánh giá'}</button><button type="button" onClick={() => setEditing(false)} className="underline">Hủy</button></div>
    </fieldset></form> : <button className="primary-button" onClick={open}>{review ? 'Sửa đánh giá' : 'Đánh giá dịch vụ'}</button>}
    {review && <ReviewReplies key={review.id} reviewId={review.id} />}
  </section>
}
