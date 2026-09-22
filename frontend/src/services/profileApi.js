import api from './api'
export const getProfile = () => api.get('/profile/me')
export const updateProfile = (data) => api.patch('/profile/me', data)
