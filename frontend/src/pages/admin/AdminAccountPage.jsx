import { useAuth } from '../../context/authState'
import ChangePasswordForm from '../../components/ChangePasswordForm'
export default function AdminAccountPage() {
  const { user } = useAuth()
  return <div className="mx-auto max-w-xl space-y-6">
    <h1 className="text-3xl font-semibold">Tài khoản Admin</h1>
    <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-6"><p className="break-all">Email: {user.email}</p><p>Vai trò: Admin</p></section>
    <ChangePasswordForm />
  </div>
}
