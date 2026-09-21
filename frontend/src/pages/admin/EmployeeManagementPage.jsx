import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getEmployees, createEmployee, updateEmployee } from '../../services/employeeApi'
import { errorMessage } from '../../utils/errorMessage'

const empty = { full_name: '', phone: '', email: '', specialty: '', experience_years: 0, status: 'active' }
export default function EmployeeManagementPage() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function load() { setLoading(true); try { setRows((await getEmployees()).data.data) } finally { setLoading(false) } }
  useEffect(() => { load().catch(failure => setError(errorMessage(failure))) }, [])
  function reset() { setForm(empty); setEditId(null) }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      if (editId) await updateEmployee(editId, form)
      else await createEmployee(form)
      reset(); await load(); setNotice('Đã lưu nhân viên.')
    } catch (failure) { setError(errorMessage(failure)) } finally { setBusy(false) }
  }
  async function toggle(row) {
    setBusy(true); setError(''); setNotice('')
    try {
      const status = row.status === 'active' ? 'inactive' : 'active'
      await updateEmployee(row.id, { status })
      if (editId === row.id) setForm(current => ({ ...current, status }))
      await load(); setNotice('Đã cập nhật trạng thái nhân viên.')
    } catch (failure) { setError(errorMessage(failure)) } finally { setBusy(false) }
  }
  return <section>
    <h1 className="text-3xl font-semibold">Quản lý nhân viên</h1>
    <p className="mt-3 text-stone-600">Quản lý hồ sơ, phân công dịch vụ và lịch làm việc.</p>
    {error && <p className="mt-4 text-red-700" role="alert">{error}</p>}
    {notice && <p className="mt-4 text-emerald-800" role="status">{notice}</p>}
    <form onSubmit={save} className="my-6 space-y-4 rounded-2xl border border-stone-200 bg-white p-6">
      <h2 className="text-xl font-semibold">{editId ? 'Sửa nhân viên' : 'Thêm nhân viên'}</h2>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        {[['full_name', 'Họ tên', 'text', 100], ['phone', 'Số điện thoại', 'tel', 20], ['email', 'Email', 'email', 255], ['specialty', 'Chuyên môn mô tả', 'text', 255]].map(([key, label, type, max]) => <label key={key} className="block text-sm font-medium">{label}<input className="form-input" type={type} required={key === 'full_name' || key === 'phone'} maxLength={max} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}
        <label className="block text-sm font-medium">Số năm kinh nghiệm<input className="form-input" type="number" required min="0" max="255" step="1" value={form.experience_years} onChange={event => setForm({ ...form, experience_years: event.target.value })} /></label>
        <label className="block text-sm font-medium">Trạng thái<select className="form-input" value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="active">Hoạt động</option><option value="inactive">Ngừng hoạt động</option></select></label>
      </fieldset>
      <div className="flex gap-4"><button disabled={busy} className="primary-button">{busy ? 'Đang lưu…' : 'Lưu nhân viên'}</button>{editId && <button type="button" disabled={busy} onClick={reset}>Hủy sửa</button>}</div>
    </form>
    {loading ? <p role="status">Đang tải…</p> : <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-stone-100"><tr><th className="p-4">Nhân viên</th><th className="p-4">Liên hệ</th><th className="p-4">Trạng thái</th><th className="p-4">Thao tác</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-stone-100"><td className="p-4"><strong>{row.full_name}</strong><p>{row.specialty}</p><p>{row.experience_years} năm kinh nghiệm</p></td><td className="p-4">{row.phone}<p>{row.email}</p></td><td className="p-4">{row.status === 'active' ? 'Hoạt động' : 'Ngừng hoạt động'}</td><td className="p-4"><div className="flex flex-wrap gap-3"><Link className="text-emerald-800 underline" to={`/admin/employees/${row.id}`}>Chi tiết / Phân công / Lịch</Link><button disabled={busy} className="underline" onClick={() => { setEditId(row.id); setForm({ ...row, email: row.email || '', specialty: row.specialty || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Sửa</button><button disabled={busy} className="underline" onClick={() => toggle(row)}>{row.status === 'active' ? 'Tắt' : 'Bật'}</button></div></td></tr>)}</tbody></table>{!rows.length && <p className="p-6">Chưa có nhân viên.</p>}</div>}
  </section>
}
