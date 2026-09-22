import { formatPrice } from './serviceDisplay'
export const formatDiscount = (promotion) => promotion.discount_type === 'percentage' ? `${Number(promotion.discount_value)}%` : formatPrice(promotion.discount_value)
export const formatPromotionDate = (value) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value.replace(' ', 'T') + '+07:00'))
export function promotionAvailability(promotion) {
  if (promotion.status !== 'active') return 'Đã tắt'
  const now = Date.now()
  if (now < Date.parse(promotion.start_at.replace(' ', 'T') + '+07:00')) return 'Chưa bắt đầu'
  if (now >= Date.parse(promotion.end_at.replace(' ', 'T') + '+07:00')) return 'Đã hết hạn'
  return 'Đang hiệu lực'
}
