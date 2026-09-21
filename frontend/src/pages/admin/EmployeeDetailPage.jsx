import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getEmployee, getAssignments, createAssignment, updateAssignment, getSchedules, createSchedule, updateSchedule } from '../../services/employeeApi'
import { getAdminServices } from '../../services/serviceApi'
import { errorMessage } from '../../utils/errorMessage'

const empty = { work_date: '', start_time: '', end_time: '', status: 'working', note: '' }
export default function EmployeeDetailPage() {
  const { id } = useParams()
  const [employee, setEmployee] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [services, setServices] = useState([])
  const [schedules, setSchedules] = useState([])
  const [serviceId, setServiceId] = useState('')
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setNotice(''); setForm(empty); setEditId(null); setServiceId('')
    Promise.all([getEmployee(id), getAssignments(id), getSchedules(id), getAdminServices()])
      .then(([profile, assigned, shifts, available]) => {
        if (!cancelled) { setEmployee(profile.data.data); setAssignments(assigned.data.data); setSchedules(shifts.data.data); setServices(available.data.data) }
      }).catch(failure => { if (!cancelled) setError(errorMessage(failure)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])
  async function perform(action, message) {
    setBusy(true); setError(''); setNotice('')
    try {
      await action()
      const [assigned, shifts] = await Promise.all([getAssignments(id), getSchedules(id)])
      setAssignments(assigned.data.data); setSchedules(shifts.data.data); setNotice(message)
    } catch (failure) { setError(errorMessage(failure)) } finally { setBusy(false) }
  }
  function saveSchedule(event) {
    event.preventDefault()
    if (form.start_time >= form.end_time) { setError('Giờ bắt đầu phải nhỏ hơn giờ kết thúc.'); return }
    perform(async () => {
      if (editId) await updateSchedule(editId, form)
      else await createSchedule({ ...form, employee_id: id })
      setForm(empty); setEditId(null)
    }, 'Đã lưu ca làm việc.')
  }
  if (loading) return <p role="status">Đang tải…</p>
  if (!employee) return <section><Link to="/admin/employees" className="underline">Về danh sách nhân viên</Link><p className="mt-4 text-red-700" role="alert">{error || 'Không tìm thấy nhân viên.'}</p></section>
  return <section className="space-y-6">
    <Link to="/admin/employees" className="text-emerald-800 underline">← Danh sách nhân viên</Link>
    <div className="rounded-2xl border border-stone-200 bg-white p-6"><h1 className="text-3xl font-semibold">{employee.full_name}</h1><p className="mt-3">{employee.phone} {employee.email && `• ${employee.email}`}</p><p className="mt-2">{employee.specialty || 'Chưa có mô tả chuyên môn'} • {employee.experience_years} năm kinh nghiệm</p><p className="mt-2">{employee.status === 'active' ? 'Hoạt động' : 'Ngừng hoạt động'}</p></div>
    {error && <p className="text-red-700" role="alert">{error}</p>}{notice && <p className="text-emerald-800" role="status">{notice}</p>}
    <section className="rounded-2xl border border-stone-200 bg-white p-6"><h2 className="text-xl font-semibold">Phân công dịch vụ</h2>
      <form className="my-4 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); perform(async () => { await createAssignment({ employee_id: id, service_id: serviceId }); setServiceId('') }, 'Đã phân công dịch vụ.') }}>
        <label className="min-w-0 flex-1 text-sm font-medium">Dịch vụ<select required disabled={busy} className="form-input" value={serviceId} onChange={event => setServiceId(event.target.value)}><option value="">Chọn dịch vụ</option>{services.filter(service => !assignments.some(item => item.service_id === service.id)).map(service => <option key={service.id} value={service.id}>{service.name} ({service.category_name}){service.status !== 'active' || service.category_status !== 'active' ? ' — đang ẩn' : ''}</option>)}</select></label><button disabled={busy || !serviceId} className="primary-button">Phân công</button>
      </form>
      <ul className="divide-y divide-stone-200">{assignments.map(item => <li key={item.service_id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><strong>{item.service_name}</strong><p className="text-sm text-stone-600">{item.status === 'active' ? 'Đang phân công' : 'Đã ngừng phân công'}</p></div><button className="text-emerald-800 underline" disabled={busy} onClick={() => perform(() => updateAssignment(id, item.service_id, item.status === 'active' ? 'inactive' : 'active'), 'Đã cập nhật phân công.')}>{item.status === 'active' ? 'Ngừng phân công' : 'Phân công lại'}</button></li>)}</ul>{!assignments.length && <p className="text-stone-500">Chưa có phân công.</p>}
    </section>
    <section className="rounded-2xl border border-stone-200 bg-white p-6"><h2 className="text-xl font-semibold">Lịch làm việc</h2><p className="mt-2 text-sm text-stone-600">Các ca đang làm không được chồng lấn. Hai ca nối tiếp được phép. Ca nghỉ không chặn ca làm; mỗi giờ bắt đầu trong cùng ngày chỉ có một bản ghi.</p>
      <form className="my-5 space-y-4" onSubmit={saveSchedule}><h3 className="font-semibold">{editId ? 'Sửa ca làm việc' : 'Thêm ca làm việc'}</h3><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Ngày làm việc<input required type="date" min="1000-01-01" max="9999-12-31" className="form-input" value={form.work_date} onChange={event => setForm({ ...form, work_date: event.target.value })} /></label>
        <label className="text-sm font-medium">Trạng thái ca<select className="form-input" value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="working">Đang làm</option><option value="off">Nghỉ</option></select></label>
        <label className="text-sm font-medium">Giờ bắt đầu<input required type="time" step="1" className="form-input" value={form.start_time} onChange={event => setForm({ ...form, start_time: event.target.value })} /></label>
        <label className="text-sm font-medium">Giờ kết thúc<input required type="time" step="1" className="form-input" value={form.end_time} onChange={event => setForm({ ...form, end_time: event.target.value })} /></label>
        <label className="text-sm font-medium sm:col-span-2">Ghi chú<input maxLength={255} className="form-input" value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} /></label>
      </fieldset><div className="flex gap-4"><button disabled={busy} className="primary-button">Lưu ca</button>{editId && <button disabled={busy} type="button" onClick={() => { setForm(empty); setEditId(null) }}>Hủy sửa</button>}</div></form>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-stone-100"><tr><th className="p-3">Ngày</th><th className="p-3">Giờ</th><th className="p-3">Trạng thái / Ghi chú</th><th className="p-3">Thao tác</th></tr></thead><tbody>{schedules.map(shift => <tr key={shift.id} className="border-t border-stone-100"><td className="p-3">{shift.work_date.split('-').reverse().join('/')}</td><td className="p-3 whitespace-nowrap">{shift.start_time} – {shift.end_time}</td><td className="p-3">{shift.status === 'working' ? 'Đang làm' : 'Nghỉ'}<p>{shift.note}</p></td><td className="p-3"><button disabled={busy} className="text-emerald-800 underline" onClick={() => { setEditId(shift.id); setForm({ work_date: shift.work_date, start_time: shift.start_time, end_time: shift.end_time, status: shift.status, note: shift.note || '' }) }}>Sửa ca</button></td></tr>)}</tbody></table>{!schedules.length && <p className="py-4 text-stone-500">Chưa có ca làm việc.</p>}</div>
    </section>
  </section>
}
