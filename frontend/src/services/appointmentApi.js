import api from './api'
export const getBookingEmployees = (serviceId, signal) => api.get('/booking/employees', { params: { service_id: serviceId }, signal })
export const getBookingSlots = (params, signal) => api.get('/booking/slots', { params, signal })
export const createAppointment = data => api.post('/appointments', data)
export const getAppointments = (admin, params) => api.get(admin ? '/admin/appointments' : '/appointments', { params })
export const getAppointment = (admin, id) => api.get(`${admin ? '/admin' : ''}/appointments/${id}`)
export const cancelAppointment = (id, cancel_reason) => api.patch(`/appointments/${id}/cancel`, { cancel_reason })
export const updateAppointmentStatus = (id, status, cancel_reason) => api.patch(`/admin/appointments/${id}/status`, { status, cancel_reason })
