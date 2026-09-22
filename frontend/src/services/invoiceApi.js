import api from './api'
export const getInvoices = (admin, params = {}) => api.get(admin ? '/admin/invoices' : '/invoices', { params })
export const getInvoice = (admin, id) => api.get(`${admin ? '/admin' : ''}/invoices/${id}`)
export const getInvoiceAppointments = () => api.get('/admin/invoices/eligible-appointments')
export const createInvoice = data => api.post('/admin/invoices', data)
