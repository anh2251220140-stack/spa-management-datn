import { useEffect, useState } from 'react'
import { useAuth } from '../../context/authState'
import { Link, useParams } from 'react-router-dom'
import { Clock, Leaf } from 'lucide-react'
import { getService } from '../../services/serviceApi'
import { formatPrice, serviceImageUrl } from '../../utils/serviceDisplay'
import { errorMessage } from '../../utils/errorMessage'
export default function ServiceDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [service, setService] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController();setLoading(true);setError('');setService(null)
    getService(id,controller.signal).then(response => { if (!controller.signal.aborted) setService(response.data.data) }).catch(failure => {if (!controller.signal.aborted) setError(errorMessage(failure))}).finally(() => {if (!controller.signal.aborted) setLoading(false)})
    return () => controller.abort()
  }, [id])
  return <section><Link to="/services" className="text-sm text-emerald-800 underline">← Danh sách dịch vụ</Link>{loading ? <p className="mt-8" role="status">Đang tải…</p> : error ? <p className="mt-8 text-red-700" role="alert">{error}</p> : service && <article className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white"><div className="grid md:grid-cols-2">{service.image_url ? <img className="h-72 w-full object-cover md:h-full" src={serviceImageUrl(service.image_url)} alt={service.name} /> : <div className="flex min-h-64 items-center justify-center bg-emerald-50 text-emerald-700"><Leaf size={64} /></div>}<div className="p-7"><p className="text-sm text-emerald-700">{service.category_name}</p><h1 className="mt-2 text-3xl font-semibold">{service.name}</h1><p className="mt-5 text-2xl font-semibold text-emerald-800">{formatPrice(service.price)}</p><p className="mt-3 flex items-center gap-2 text-stone-600"><Clock size={18} />{service.duration_minutes} phút</p><div className="mt-5">{user?.role !== 'admin' && <Link className="primary-button" to={`/booking?service_id=${service.id}`}>Đặt lịch dịch vụ</Link>}</div><h2 className="mt-7 font-semibold">Mô tả</h2><p className="mt-2 whitespace-pre-wrap leading-7 text-stone-600">{service.description}</p>{service.benefits && <><h2 className="mt-6 font-semibold">Lợi ích</h2><p className="mt-2 whitespace-pre-wrap leading-7 text-stone-600">{service.benefits}</p></>}{service.suitability_notes && <><h2 className="mt-6 font-semibold">Thông tin phù hợp và lưu ý</h2><p className="mt-2 whitespace-pre-wrap leading-7 text-stone-600">{service.suitability_notes}</p></>}</div></div></article>}</section>
}
