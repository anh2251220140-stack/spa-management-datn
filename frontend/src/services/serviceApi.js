import api from './api'
export const getServices = (params, signal) => api.get('/services', { params, signal, skipAuth: true })
export const getService = (id, signal) => api.get('/services/' + id, { signal, skipAuth: true })
export const getAdminServices = () => api.get('/admin/services')
export const createService = (data) => api.post('/admin/services', data)
export const updateService = (id, data) => api.patch('/admin/services/' + id, data)
