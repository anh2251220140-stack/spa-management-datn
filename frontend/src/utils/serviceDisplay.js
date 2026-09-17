export const formatPrice = (price) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(price))
export const serviceImageUrl = (path) => path ? new URL(path, import.meta.env.VITE_API_URL).href : null
