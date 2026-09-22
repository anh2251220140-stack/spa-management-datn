import api from './api'
export const getActivePromotions = () => api.get('/promotions/active')
export const getAdminPromotions = () => api.get('/admin/promotions')
export const createPromotion = (data) => api.post('/admin/promotions', data)
export const updatePromotion = (id, data) => api.patch(`/admin/promotions/${id}`, data)
export const updatePromotionStatus = (id, status) => api.patch(`/admin/promotions/${id}/status`, { status })
