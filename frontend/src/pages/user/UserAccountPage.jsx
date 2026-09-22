import { useEffect, useRef, useState } from 'react'
import { UserRound } from 'lucide-react'
import { useAuth } from '../../context/authState'
import { getProfile, updateProfile } from '../../services/profileApi'
import { errorMessage } from '../../utils/errorMessage'
import ChangePasswordForm from '../../components/ChangePasswordForm'

export default function UserAccountPage() {
  const { refreshCustomer } = useAuth()
  const [profile, setProfile] = useState(null)
  const [image, setImage] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInput = useRef(null)
  useEffect(() => {
    let active = true
    getProfile().then(({ data }) => { if (active) setProfile(data.data) }).catch(err => { if (active) setError(errorMessage(err)) })
    return () => { active = false }
  }, [])
  function selectImage(event) {
    setError(''); setSuccess(''); setImage(null)
    const file = event.target.files[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Chọn ảnh JPG, PNG hoặc WebP, tối đa 5 MB.'); event.target.value = ''; return
    }
    setImage(file)
  }
  async function submit(event) {
    event.preventDefault(); setError(''); setSuccess('')
    if (!profile.full_name.trim() || !profile.phone.trim()) return setError('Vui lòng nhập họ tên và số điện thoại.')
    const body = new FormData()
    body.append('full_name', profile.full_name.trim()); body.append('phone', profile.phone.trim())
    if (image) body.append('image', image)
    setSaving(true)
    try {
      const { data } = await updateProfile(body)
      setProfile(data.data); refreshCustomer(data.data); setImage(null); fileInput.current.value = ''; setSuccess('Cập nhật hồ sơ thành công.')
    } catch (err) { setError(errorMessage(err)) }
    finally { setSaving(false) }
  }
  return <div className="mx-auto max-w-xl space-y-6">
    <h1 className="text-3xl font-semibold">Tài khoản của tôi</h1>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {success && <p role="status" className="text-emerald-700">{success}</p>}
    {!profile ? <p>{error ? 'Không tải được hồ sơ. Vui lòng tải lại trang.' : 'Đang tải hồ sơ…'}</p> : <form onSubmit={submit} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6">
      {profile.avatar_url ? <img src={new URL(profile.avatar_url, import.meta.env.VITE_API_URL).href} alt="Ảnh đại diện" className="h-24 w-24 rounded-full object-cover" /> : <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50 text-emerald-800"><UserRound size={40} aria-label="Chưa có ảnh đại diện" /></div>}
      <label className="block text-sm font-medium">Ảnh đại diện<input ref={fileInput} className="mt-2 block w-full text-sm" type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} onChange={selectImage} /></label>
      <p className="text-sm text-stone-500">JPG, PNG hoặc WebP, tối đa 5 MB. Nhấn Lưu hồ sơ để cập nhật ảnh.</p>
      <label className="block text-sm font-medium">Họ tên<input className="form-input" required maxLength={100} disabled={saving} value={profile.full_name} onChange={event => setProfile({ ...profile, full_name: event.target.value })} /></label>
      <label className="block text-sm font-medium">Email<input className="form-input bg-stone-50" value={profile.email} readOnly /></label>
      <label className="block text-sm font-medium">Số điện thoại<input type="tel" className="form-input" required maxLength={20} disabled={saving} value={profile.phone} onChange={event => setProfile({ ...profile, phone: event.target.value })} /></label>
      <button className="primary-button" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu hồ sơ'}</button>
    </form>}
    <ChangePasswordForm />
  </div>
}
