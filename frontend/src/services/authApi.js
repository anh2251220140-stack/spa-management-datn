import api from './api'
export const registerAccount = (data) => api.post('/auth/register', data, { skipAuth: true })
export const loginAccount = (data) => api.post('/auth/login', data, { skipAuth: true })
export const getCurrentUser = (token, signal) => api.get('/auth/me', {
  skipAuth: true, headers: { Authorization: 'Bearer ' + token }, signal,
})
