export function getChatError(error) {
  if (error.response?.status === 429) return {
    message: 'Bạn gửi quá nhiều câu hỏi. Vui lòng thử lại sau một phút.',
    canRetry: true,
  }
  if (error.response?.data?.code === 'AI_QUOTA_EXCEEDED') return {
    message: 'Trợ lý AI đã đạt giới hạn sử dụng tạm thời. Vui lòng quay lại sau.',
    canRetry: false,
  }
  return {
    message: 'Trợ lý đang tạm thời không sẵn sàng. Vui lòng thử lại sau.',
    canRetry: true,
  }
}
