import { Navigate } from 'react-router-dom'
import SpaHome from './SpaHome'
import { useAuth } from '../../context/authState'
import AuthStatus from '../../components/AuthStatus'
export default function HomePage() {
  const { user, token, loading, sessionError } = useAuth()
  if (loading || (token && sessionError)) return <AuthStatus />
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/user'} replace />
  return <SpaHome />
}

