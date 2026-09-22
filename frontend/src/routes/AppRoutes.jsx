import ServiceListPage from '../pages/public/ServiceListPage'
import UserAccountPage from '../pages/user/UserAccountPage'
import AdminAccountPage from '../pages/admin/AdminAccountPage'
import BookingPage from '../pages/user/BookingPage'
import MyAppointmentsPage from '../pages/user/MyAppointmentsPage'
import AppointmentManagementPage from '../pages/admin/AppointmentManagementPage'
import EmployeeManagementPage from '../pages/admin/EmployeeManagementPage'
import EmployeeDetailPage from '../pages/admin/EmployeeDetailPage'
import ServiceDetailPage from '../pages/public/ServiceDetailPage'
import CategoryManagementPage from '../pages/admin/CategoryManagementPage'
import ServiceManagementPage from '../pages/admin/ServiceManagementPage'
import { Navigate, Route, Routes } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import ProtectedRoute from './ProtectedRoute'
import LoginPage from '../pages/auth/LoginPage'
import RegisterPage from '../pages/auth/RegisterPage'
import UserDashboard from '../pages/user/UserDashboard'
import AdminDashboard from '../pages/admin/AdminDashboard'
import HomePage from '../pages/public/HomePage'
export default function AppRoutes() {
  return <Routes><Route element={<MainLayout />}>
    <Route index element={<HomePage />} />
    <Route element={<ProtectedRoute role="user" />}><Route path="account" element={<UserAccountPage />} /></Route>
    <Route element={<ProtectedRoute role="admin" />}><Route path="admin/account" element={<AdminAccountPage />} /></Route>
    <Route path="services" element={<ServiceListPage />} />
    <Route path="services/:id" element={<ServiceDetailPage />} />
    <Route path="login" element={<LoginPage />} />
    <Route path="register" element={<RegisterPage />} />
    <Route element={<ProtectedRoute role="user" />}><Route path="user" element={<UserDashboard />} /></Route>
    <Route element={<ProtectedRoute role="admin" />}><Route path="admin" element={<AdminDashboard />} /><Route path="admin/categories" element={<CategoryManagementPage />} /><Route path="admin/services" element={<ServiceManagementPage />} /></Route>
    <Route element={<ProtectedRoute role="admin" />}><Route path="admin/employees" element={<EmployeeManagementPage />} /><Route path="admin/employees/:id" element={<EmployeeDetailPage />} /></Route>
    <Route element={<ProtectedRoute role="user" />}><Route path="booking" element={<BookingPage />} /><Route path="appointments" element={<MyAppointmentsPage />} /></Route>
    <Route element={<ProtectedRoute role="admin" />}><Route path="admin/appointments" element={<AppointmentManagementPage />} /></Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route></Routes>
}
