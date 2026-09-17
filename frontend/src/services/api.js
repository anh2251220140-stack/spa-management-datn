import axios from 'axios'
import { getToken } from '../utils/authStorage'
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL, timeout: 10000 })
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token && !config.skipAuth) config.headers.Authorization = 'Bearer ' + token
  return config
})
export default api
