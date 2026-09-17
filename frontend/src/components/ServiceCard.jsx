import { Link } from 'react-router-dom'
import { Clock, Leaf } from 'lucide-react'
import { formatPrice, serviceImageUrl } from '../utils/serviceDisplay'
export default function ServiceCard({ service }) {
  return <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
    <Link to={'/services/' + service.id} className="block">
      {service.image_url ? <img src={serviceImageUrl(service.image_url)} alt={service.name} className="h-48 w-full object-cover" loading="lazy" /> : <div className="flex h-48 items-center justify-center bg-emerald-50 text-emerald-700"><Leaf size={44} aria-label="Chưa có ảnh dịch vụ" /></div>}
      <div className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{service.category_name}</p><h2 className="mt-2 text-xl font-semibold">{service.name}</h2><p className="mt-3 line-clamp-2 text-sm leading-6 text-stone-600">{service.description}</p><div className="mt-5 flex flex-wrap items-center justify-between gap-2"><strong className="text-emerald-800">{formatPrice(service.price)}</strong><span className="flex items-center gap-1 text-sm text-stone-500"><Clock size={15} />{service.duration_minutes} phút</span></div><p className="mt-4 text-sm font-medium text-emerald-800">Xem chi tiết →</p></div>
    </Link>
  </article>
}
