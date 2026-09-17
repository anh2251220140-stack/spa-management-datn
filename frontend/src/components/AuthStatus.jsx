import { LoaderCircle } from 'lucide-react'
import { useAuth } from '../context/authState'
export default function AuthStatus() {
  const { loading, sessionError, retry, logout } = useAuth()
  return <section className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center" aria-live="polite">
    {loading ? <><LoaderCircle className="mx-auto mb-4 animate-spin text-emerald-800" /><p>Đang kiểm tra phiên đăng nhập…</p></> : <><p role="alert">{sessionError}</p><div className="mt-6 flex justify-center gap-4"><button className="primary-button" onClick={retry}>Thử lại</button><button onClick={logout}>Đăng xuất</button></div></>}
  </section>
}
