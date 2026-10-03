import api from './api'

export const getDashboard = signal => api.get('/admin/dashboard', { signal })
