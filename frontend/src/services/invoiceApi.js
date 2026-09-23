import api from './api'
export const createPayment = id => api.post(`/invoices/${id}/payments`)
export const getInvoices = (admin, params = {}) => api.get(admin ? '/admin/invoices' : '/invoices', { params })
export const getInvoice = (admin, id, signal) => api.get(`${admin ? '/admin' : ''}/invoices/${id}`, { signal })
export const getInvoiceAppointments = () => api.get('/admin/invoices/eligible-appointments')
export const createInvoice = data => api.post('/admin/invoices', data)
