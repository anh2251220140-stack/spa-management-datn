import { useEffect, useState } from 'react'
import { getReviewReplies, createReviewReply } from '../services/reviewApi'
import { errorMessage } from '../utils/errorMessage'
import { formatPromotionDate } from '../utils/promotionDisplay'

export default function ReviewReplies({ reviewId, admin = false }) {
  const [replies, setReplies] = useState([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    getReviewReplies(reviewId, admin).then(response => { if (active) setReplies(response.data.data) })
      .catch(err => { if (active) setError(errorMessage(err)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reviewId, admin])
  async function send(event) {
    event.preventDefault()
    if (busy) return
    const text = message.trim()
    if (!text || text.length > 2000) return setError('Phản hồi phải có từ 1 đến 2000 ký tự.')
    setBusy(true); setError('')
    try {
      const response = await createReviewReply(reviewId, text, admin)
      setMessage('')
      setReplies(current => [...current, response.data.data])
      setReplies((await getReviewReplies(reviewId, admin)).data.data)
    } catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  return <section className="space-y-3 border-t border-stone-200 pt-4">
    <h3 className="font-semibold">Phản hồi đánh giá</h3>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading ? <p role="status">Đang tải phản hồi…</p> : <div className="space-y-3">
      {!replies.length && <p className="text-sm text-stone-500">Chưa có phản hồi.</p>}
      {replies.map(reply => <article key={reply.id} className="rounded-lg bg-stone-50 p-3">
        <p className="font-semibold text-emerald-900">{reply.sender_name}</p>
        <p className="text-xs text-stone-500">{formatPromotionDate(reply.created_at)}</p>
        <p className="whitespace-pre-wrap break-words">{reply.message}</p>
      </article>)}
    </div>}
    <form onSubmit={send} className="space-y-3">
      <label className="block">Nội dung phản hồi<textarea className="form-input" maxLength={2000} value={message} disabled={busy} onChange={event => setMessage(event.target.value)} /></label>
      <button className="primary-button" disabled={busy || loading || !message.trim()}>{busy ? 'Đang gửi…' : 'Gửi phản hồi'}</button>
    </form>
  </section>
}
