import { useEffect, useState } from 'react'
import { getActivePromotions } from '../../services/promotionApi'
import { errorMessage } from '../../utils/errorMessage'
import { formatDiscount, formatPromotionDate } from '../../utils/promotionDisplay'
import { formatPrice } from '../../utils/serviceDisplay'
export default function PromotionListPage() {
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    async function load() {
      try { const { data } = await getActivePromotions(); if (active) { setRows(data.data); setError('') } }
      catch (err) { if (active) { setRows([]); setError(errorMessage(err)) } }
      finally { if (active) setLoading(false) }
    }
    load()
    // Làm mới danh sách khi chương trình bắt đầu/hết hạn trong lúc trang đang mở.
    const timer = setInterval(load, 60000)
    return () => { active = false; clearInterval(timer) }
  }, [])
  return <section><h1 className="text-3xl font-semibold">Khuyến mãi</h1><p className="mt-3 text-stone-600">Các chương trình đang có hiệu lực tại An Nhiên Spa. Thời gian theo giờ Việt Nam.</p>
    {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
    {loading ? <p role="status" className="mt-6">Đang tải…</p> : !error && (!rows.length ? <p className="mt-6 text-stone-500">Hiện chưa có khuyến mãi đang hiệu lực.</p> : <div className="mt-6 grid gap-5 sm:grid-cols-2">{rows.map(row => <article key={row.id} className="rounded-2xl border border-emerald-100 bg-white p-6"><p className="text-sm font-semibold text-emerald-800">{row.code}</p><h2 className="mt-2 text-xl font-semibold">{row.name}</h2><p className="mt-3 text-2xl font-semibold text-emerald-800">Giảm {formatDiscount(row)}</p><p className="mt-3 whitespace-pre-wrap text-stone-600">{row.description}</p>{Number(row.minimum_amount) > 0 && <p className="mt-3 text-sm">Giá trị đơn tối thiểu: {formatPrice(row.minimum_amount)}</p>}{row.max_discount_amount && <p className="mt-2 text-sm">Giảm tối đa: {formatPrice(row.max_discount_amount)}</p>}<p className="mt-4 text-sm text-stone-500">{formatPromotionDate(row.start_at)} – {formatPromotionDate(row.end_at)}</p></article>)}</div>)}
  </section>
}
