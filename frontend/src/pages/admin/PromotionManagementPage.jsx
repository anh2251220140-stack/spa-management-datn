import { useEffect, useState } from 'react'
import { getAdminPromotions, createPromotion, updatePromotion, updatePromotionStatus } from '../../services/promotionApi'
import { errorMessage } from '../../utils/errorMessage'
import { formatDiscount, formatPromotionDate, promotionAvailability } from '../../utils/promotionDisplay'
const empty = { code: '', name: '', description: '', discount_type: 'percentage', discount_value: '', minimum_amount: '0', max_discount_amount: '', start_at: '', end_at: '', status: 'active' }
export default function PromotionManagementPage() {
  const [rows, setRows] = useState([]), [form, setForm] = useState(empty), [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  async function load() {
    setLoading(true)
    try { const { data } = await getAdminPromotions(); setRows(data.data) }
    finally { setLoading(false) }
  }
  useEffect(() => { load().catch(err => setError(errorMessage(err))) }, [])
  function reset() { setEditId(null); setForm(empty) }
  function edit(row) {
    setEditId(row.id); setError(''); setNotice('')
    setForm({ code: row.code, name: row.name, description: row.description || '', discount_type: row.discount_type, discount_value: row.discount_value, minimum_amount: row.minimum_amount, max_discount_amount: row.max_discount_amount ?? '', start_at: row.start_at.replace(' ', 'T'), end_at: row.end_at.replace(' ', 'T'), status: row.status })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function save(event) {
    event.preventDefault(); setError(''); setNotice('')
    if (!form.code.trim() || !form.name.trim()) return setError('Vui lòng nhập mã và tên khuyến mãi.')
    if (!form.start_at || !form.end_at || form.start_at >= form.end_at) return setError('Thời gian bắt đầu phải trước thời gian kết thúc.')
    if (Number(form.discount_value) <= 0 || (form.discount_type === 'percentage' && Number(form.discount_value) > 100)) return setError('Giá trị giảm không hợp lệ; phần trăm phải lớn hơn 0 và tối đa 100.')
    setBusy(true)
    const data = { ...form, code: form.code.trim(), name: form.name.trim(), max_discount_amount: form.discount_type === 'fixed' || form.max_discount_amount === '' ? null : form.max_discount_amount }
    try {
      if (editId) await updatePromotion(editId, data); else await createPromotion(data)
      reset(); await load(); setNotice('Đã lưu khuyến mãi.')
    } catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  async function toggle(row) {
    if (row.status === 'active' && !window.confirm(`Tắt khuyến mãi ${row.code}? Khuyến mãi sẽ không hiển thị công khai.`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const status = row.status === 'active' ? 'inactive' : 'active'
      await updatePromotionStatus(row.id, status)
      if (editId === row.id) setForm(current => ({ ...current, status }))
      await load(); setNotice('Đã cập nhật trạng thái khuyến mãi.')
    } catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  const field = key => ({ value: form[key], onChange: event => setForm({ ...form, [key]: event.target.value }) })
  return <section>
    <h1 className="text-3xl font-semibold">Quản lý khuyến mãi</h1>
    <p className="mt-3 text-stone-600">Chỉ khuyến mãi bật và đang trong thời gian hiệu lực mới hiển thị công khai. Thời gian theo giờ Việt Nam.</p>
    {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}{notice && <p role="status" className="mt-4 text-emerald-800">{notice}</p>}
    <form onSubmit={save} className="my-6 rounded-2xl border border-stone-200 bg-white p-6">
      <h2 className="mb-4 text-xl font-semibold">{editId ? 'Sửa khuyến mãi' : 'Thêm khuyến mãi'}</h2>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Mã khuyến mãi<input className="form-input" required maxLength={50} {...field('code')} /></label>
        <label className="text-sm font-medium">Tên khuyến mãi<input className="form-input" required maxLength={150} {...field('name')} /></label>
        <label className="text-sm font-medium sm:col-span-2">Mô tả<textarea className="form-input" rows={3} {...field('description')} /></label>
        <label className="text-sm font-medium">Loại giảm<select className="form-input" value={form.discount_type} onChange={event => setForm({ ...form, discount_type: event.target.value, max_discount_amount: '' })}><option value="percentage">Phần trăm (%)</option><option value="fixed">Số tiền cố định (VNĐ)</option></select></label>
        <label className="text-sm font-medium">Giá trị giảm<input className="form-input" type="number" required min={form.discount_type === 'percentage' ? '0.01' : '1'} step={form.discount_type === 'percentage' ? '0.01' : '1'} max={form.discount_type === 'percentage' ? '100' : '9999999999'} {...field('discount_value')} /></label>
        <label className="text-sm font-medium">Giá trị đơn tối thiểu (VNĐ)<input className="form-input" type="number" required min="0" step="1" max="999999999999" {...field('minimum_amount')} /></label>
        {form.discount_type === 'percentage' && <label className="text-sm font-medium">Mức giảm tối đa (VNĐ, không bắt buộc)<input className="form-input" type="number" min="1" step="1" max="999999999999" {...field('max_discount_amount')} /></label>}
        <label className="text-sm font-medium">Bắt đầu<input className="form-input" type="datetime-local" step="1" required {...field('start_at')} /></label>
        <label className="text-sm font-medium">Kết thúc<input className="form-input" type="datetime-local" step="1" required {...field('end_at')} /></label>
        <label className="text-sm font-medium">Trạng thái<select className="form-input" {...field('status')}><option value="active">Bật</option><option value="inactive">Tắt</option></select></label>
        <div className="flex items-center gap-4 sm:col-span-2"><button className="primary-button">{busy ? 'Đang xử lý…' : 'Lưu khuyến mãi'}</button>{editId && <button type="button" onClick={reset}>Hủy sửa</button>}</div>
      </fieldset>
    </form>
    {loading ? <p role="status">Đang tải khuyến mãi…</p> : <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-stone-100"><tr>{['Khuyến mãi','Loại / Giá trị giảm','Thời gian (VN)','Trạng thái','Thao tác'].map(label => <th key={label} className="p-4">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-stone-100">
      <td className="p-4"><strong>{row.code}</strong><p>{row.name}</p><p className="mt-1 whitespace-pre-wrap text-stone-500">{row.description}</p></td>
      <td className="p-4">{row.discount_type === 'percentage' ? 'Phần trăm' : 'Số tiền cố định'}<p className="font-semibold">{formatDiscount(row)}</p></td>
      <td className="whitespace-nowrap p-4"><p>{formatPromotionDate(row.start_at)}</p><p>đến {formatPromotionDate(row.end_at)}</p></td>
      <td className="p-4"><p>{row.status === 'active' ? 'Bật' : 'Tắt'}</p><p className="text-stone-500">{promotionAvailability(row)}</p></td>
      <td className="p-4"><div className="flex gap-4"><button disabled={busy} className="text-emerald-800 underline" onClick={() => edit(row)}>Sửa</button><button disabled={busy} className="underline" onClick={() => toggle(row)}>{row.status === 'active' ? 'Tắt' : 'Kích hoạt lại'}</button></div></td>
    </tr>)}</tbody></table>{!rows.length && <p className="p-6 text-stone-500">Chưa có khuyến mãi.</p>}</div>}
  </section>
}
