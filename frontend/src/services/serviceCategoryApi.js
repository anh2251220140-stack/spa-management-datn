import api from './api'
export const getCategories = () => api.get('/service-categories', { skipAuth: true })
export const getAdminCategories = () => api.get('/admin/service-categories')
export const createCategory = (data) => api.post('/admin/service-categories', data)
export const updateCategory = (id, data) => api.patch('/admin/service-categories/' + id, data)
