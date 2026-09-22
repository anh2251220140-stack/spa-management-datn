import { useState } from 'react'
import { changePassword } from '../services/authApi'
import { errorMessage } from '../utils/errorMessage'

const emptyForm = { current_password: '', new_password: '', confirm_password: '' }
export default function ChangePasswordForm() {
  const [form, setForm] = useState(emptyForm)
  const [visible, setVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  async function submit(event) {
    event.preventDefault(); setError(''); setSuccess('')
    if (!form.current_password || !form.new_password || !form.confirm_password) return setError('Vui lòng nhập đủ mật khẩu.')
    if (form.new_password.length < 8 || new TextEncoder().encode(form.new_password).length > 72) return setError('Mật khẩu mới cần ít nhất 8 ký tự và tối đa 72 byte.')
    if (form.new_password !== form.confirm_password) return setError('Xác nhận mật khẩu không khớp.')
    setSaving(true)
    try {
      await changePassword({ current_password: form.current_password, new_password: form.new_password })
      setForm(emptyForm); setSuccess('Đổi mật khẩu thành công.')
    } catch (err) { setError(errorMessage(err)) }
    finally { setSaving(false) }
  }
  return <section className="rounded-2xl border border-stone-200 bg-white p-6">
    <h2 className="text-xl font-semibold">Đổi mật khẩu</h2>
    <form onSubmit={submit} className="mt-5 space-y-4">
      {[[ 'current_password', 'Mật khẩu hiện tại' ], [ 'new_password', 'Mật khẩu mới' ], [ 'confirm_password', 'Xác nhận mật khẩu mới' ]].map(([key, label]) => <label key={key} className="block text-sm font-medium">{label}<input className="form-input" type={visible ? 'text' : 'password'} autoComplete={key === 'current_password' ? 'current-password' : 'new-password'} required disabled={saving} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} />Hiện mật khẩu</label>
      <p className="text-sm text-stone-500">Mật khẩu mới cần ít nhất 8 ký tự, tối đa 72 byte.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="text-sm text-emerald-700">{success}</p>}
      <button className="primary-button" disabled={saving}>{saving ? 'Đang lưu…' : 'Đổi mật khẩu'}</button>
    </form>
  </section>
}
