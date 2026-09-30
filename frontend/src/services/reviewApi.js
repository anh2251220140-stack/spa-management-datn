import api from './api'
export const getOwnReview = appointmentId => api.get(`/reviews/${appointmentId}`)
export const createReview = data => api.post('/reviews', data)
export const updateReview = (id, data) => api.patch(`/reviews/${id}`, data)
export const getReviews = () => api.get('/admin/reviews')
export const getReview = id => api.get(`/admin/reviews/${id}`)

export const getReviewReplies = (id, admin = false) => api.get(`${admin ? '/admin' : ''}/reviews/${id}/replies`)
export const createReviewReply = (id, message, admin = false) => api.post(`${admin ? '/admin' : ''}/reviews/${id}/replies`, { message })
