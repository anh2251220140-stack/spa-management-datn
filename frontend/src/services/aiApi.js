import api from './api'
export const sendChat = (data, signal) => api.post('/ai/chat', data, { signal, skipAuth: true })
