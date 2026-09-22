import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getServices } from '../../services/serviceApi'
import { getBookingEmployees, getBookingSlots, createAppointment } from '../../services/appointmentApi'
import { formatPrice } from '../../utils/serviceDisplay'
import { errorMessage } from '../../utils/errorMessage'

export default function BookingPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [services, setServices] = useState([])
  const [employees, setEmployees] = useState([])
  const [slots, setSlots] = useState([])
  const [serviceId, setServiceId] = useState(params.get('service_id') || '')
  const [employeeId, setEmployeeId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const chosen = services.find(row => String(row.id) === serviceId)
  useEffect(() => {
    const controller = new AbortController()
    getServices({}, controller.signal).then(response => setServices(response.data.data)).catch(failure => { if (!controller.signal.aborted) setError(errorMessage(failure)) })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    if (serviceId) getBookingEmployees(serviceId, controller.signal).then(response => setEmployees(response.data.data)).catch(failure => { if (!controller.signal.aborted) setError(errorMessage(failure)) })
    return () => controller.abort()
  }, [serviceId])
  useEffect(() => {
    const controller = new AbortController()
    if (serviceId && employeeId && date) {
      setLoading(true)
      getBookingSlots({ service_id: serviceId, employee_id: employeeId, date }, controller.signal)
        .then(response => { if (!controller.signal.aborted) setSlots(response.data.data.slots) })
        .catch(failure => { if (!controller.signal.aborted) setError(errorMessage(failure)) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }
    return () => controller.abort()
  }, [serviceId, employeeId, date, revision])
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await createAppointment({ service_id: serviceId, employee_id: employeeId, date, start_time: time, note })
      navigate('/appointments', { state: { message: 'Đặt lịch thành công. Lịch đang chờ xác nhận.' } })
    } catch (failure) { setError(errorMessage(failure)); setTime(''); setSlots([]); setRevision(value => value + 1) }
    finally { setBusy(false) }
  }
  return <section className="mx-auto max-w-2xl"><h1 className="text-3xl font-semibold">Đặt lịch dịch vụ</h1><p className="mt-3 text-stone-600">Chọn dịch vụ, nhân viên và giờ phù hợp. Tất cả giờ tính theo giờ Việt Nam.</p>
    {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
    <form onSubmit={submit} className="mt-6 space-y-5 rounded-2xl border border-stone-200 bg-white p-6"><fieldset disabled={busy} className="space-y-5">
      <label className="block font-medium">Dịch vụ<select required className="form-input" value={serviceId} onChange={event => { setServiceId(event.target.value); setEmployeeId(''); setEmployees([]); setSlots([]); setTime(''); setError('') }}><option value="">Chọn dịch vụ</option>{services.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      {chosen && <p className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{formatPrice(chosen.price)} • {chosen.duration_minutes} phút</p>}
      <label className="block font-medium">Nhân viên<select required className="form-input" value={employeeId} onChange={event => { setEmployeeId(event.target.value); setSlots([]); setTime(''); setError('') }}><option value="">Chọn nhân viên</option>{employees.map(row => <option key={row.id} value={row.id}>{row.full_name}</option>)}</select></label>
      {serviceId && !employees.length && <p className="text-sm text-stone-500">Chưa có nhân viên khả dụng hoặc đang tải danh sách.</p>}
      <label className="block font-medium">Ngày<input type="date" required className="form-input" value={date} min={new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)} max="9999-12-31" onChange={event => { setDate(event.target.value); setSlots([]); setTime(''); setError('') }} /></label>
      <label className="block font-medium">Giờ bắt đầu<select required disabled={loading} className="form-input" value={time} onChange={event => setTime(event.target.value)}><option value="">{loading ? 'Đang tải giờ trống…' : 'Chọn giờ'}</option>{slots.map(slot => <option key={slot.start_time} value={slot.start_time}>{slot.start_time} – {slot.end_time}</option>)}</select></label>
      {date && employeeId && !loading && !slots.length && <p className="text-sm text-stone-600">Không có giờ trống phù hợp. Hãy chọn ngày hoặc nhân viên khác.</p>}
      <label className="block font-medium">Ghi chú<textarea maxLength={2000} className="form-input" value={note} onChange={event => setNote(event.target.value)} /></label>
      <p className="text-sm text-stone-500">Giờ trống có thể thay đổi. Hệ thống kiểm tra lại khi bạn xác nhận đặt lịch.</p>
      <button className="primary-button" disabled={busy || loading || !time || !chosen}>{busy ? 'Đang đặt…' : 'Xác nhận đặt lịch'}</button>
    </fieldset></form><Link to="/appointments" className="mt-5 inline-block text-emerald-800 underline">Lịch hẹn của tôi</Link>
  </section>
}
