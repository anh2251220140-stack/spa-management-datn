const key = 'spa_access_token'
export const getToken = () => localStorage.getItem(key)
export const saveToken = (token) => localStorage.setItem(key, token)
export const removeToken = () => localStorage.removeItem(key)
export const tokenStorageKey = key
