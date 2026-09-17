export function errorMessage(error) {
  if (!error.response) return 'Không kết nối được máy chủ. Hãy kiểm tra Backend và thử lại.'
  const message = error.response.data?.message
  const messages = {
    'Email already exists': 'Email này đã được đăng ký.',
    'Invalid email or password': 'Email hoặc mật khẩu không đúng.',
    'Account is locked': 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.',
    'Internal server error': 'Máy chủ gặp lỗi. Vui lòng thử lại sau.',
    'Invalid or expired token': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  }
  return messages[message] || message || 'Yêu cầu chưa thực hiện được. Vui lòng thử lại.'
}
