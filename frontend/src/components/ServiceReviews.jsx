import { useEffect, useState } from 'react'
import { getServiceReviews } from '../services/serviceApi'
import { errorMessage } from '../utils/errorMessage'
import { formatPromotionDate } from '../utils/promotionDisplay'
import RatingStars from './RatingStars'

export default function ServiceReviews({ serviceId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setData(null); setError('')
    getServiceReviews(serviceId, controller.signal)
      .then(response => { if (!controller.signal.aborted) setData(response.data.data) })
      .catch(err => { if (!controller.signal.aborted) setError(errorMessage(err)) })
    return () => controller.abort()
  }, [serviceId])
  return <section className="space-y-5 border-t border-stone-200 p-7">
    <h2 className="text-xl font-semibold">Đánh giá từ khách hàng</h2>
    {error ? <p role="alert" className="text-red-700">{error}</p> : !data ? <p role="status">Đang tải đánh giá…</p> : <>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-2xl font-semibold">{data.average_rating.toFixed(1)}</span>
        <RatingStars value={data.average_rating} />
        <span className="text-stone-600">{data.total_reviews} đánh giá</span>
      </div>
      {!data.reviews.length && <p>Chưa có đánh giá cho dịch vụ này.</p>}
      {data.reviews.map(review => <article key={review.review_id} className="space-y-2 border-t border-stone-100 pt-4">
        <h3 className="font-semibold">{review.customer_name}</h3>
        <RatingStars value={review.rating} />
        <p className="text-xs text-stone-500">{formatPromotionDate(review.created_at)}</p>
        {review.comment && <p className="whitespace-pre-wrap break-words">{review.comment}</p>}
        {review.replies.map(reply => <div key={reply.id} className="ml-4 space-y-1 rounded border-l-2 border-emerald-200 bg-stone-50 p-3">
          <p className="font-semibold text-emerald-900">{reply.sender_label}</p>
          <p className="text-xs text-stone-500">{formatPromotionDate(reply.created_at)}</p>
          <p className="whitespace-pre-wrap break-words">{reply.message}</p>
        </div>)}
      </article>)}
    </>}
  </section>
}
