import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { getServices } from '../../services/serviceApi'
import { getCategories } from '../../services/serviceCategoryApi'
import { errorMessage } from '../../utils/errorMessage'
import ServiceCard from '../../components/ServiceCard'
export default function ServiceListPage() {
  const [params, setParams] = useSearchParams()
  const search = params.get('search') || ''
  const categoryId = params.get('category_id') || ''
  const [keyword, setKeyword] = useState(search)
  const [categories, setCategories] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setKeyword(search)
    Promise.all([getCategories(), getServices({ ...(search ? {search} : {}), ...(categoryId ? {category_id:categoryId} : {}) }, controller.signal)])
      .then(([categoryResponse, serviceResponse]) => { if (!controller.signal.aborted) {setCategories(categoryResponse.data.data);setServices(serviceResponse.data.data)} })
      .catch(failure => { if (!controller.signal.aborted) setError(errorMessage(failure)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [search, categoryId, attempt])
  function filter(nextSearch, nextCategory) { setParams({ ...(nextSearch.trim() ? { search: nextSearch.trim() } : {}), ...(nextCategory ? { category_id: nextCategory } : {}) }) }
  return <section><p className="text-sm font-medium text-emerald-800">CHĂM SÓC & THƯ GIÃN</p><h1 className="mt-2 text-3xl font-semibold">Dịch vụ tại Spa</h1><p className="mt-3 text-stone-600">Tìm dịch vụ phù hợp với nhu cầu của bạn.</p>
    <form onSubmit={event => {event.preventDefault();filter(keyword,categoryId)}} className="my-8 flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-5"><label className="min-w-48 flex-1 text-sm font-medium">Tên dịch vụ<input className="form-input" value={keyword} maxLength={150} onChange={event => setKeyword(event.target.value)} placeholder="Nhập tên dịch vụ…" /></label><label className="min-w-48 text-sm font-medium">Danh mục<select className="form-input" value={categoryId} onChange={event => filter(keyword,event.target.value)}><option value="">Tất cả danh mục</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="primary-button"><Search size={18} />Tìm kiếm</button><button type="button" className="px-3 py-3 text-sm underline" onClick={() => {setKeyword('');setParams({})}}>Xóa lọc</button></form>
    {loading ? <p role="status">Đang tải dịch vụ…</p> : error ? <div role="alert" className="text-red-700">{error}<button className="ml-3 underline" onClick={() => setAttempt(value => value+1)}>Thử lại</button></div> : services.length ? <><p className="mb-4 text-sm text-stone-500">{services.length} dịch vụ</p><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{services.map(service => <ServiceCard key={service.id} service={service} />)}</div></> : <p className="rounded-xl bg-white p-8 text-center text-stone-500">Chưa có dịch vụ phù hợp. Bạn có thể thử từ khóa hoặc danh mục khác.</p>}
  </section>
}
