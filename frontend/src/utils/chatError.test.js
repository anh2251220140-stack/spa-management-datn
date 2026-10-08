import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getChatError } from './chatError.js'

test('provider quota displays safe message and hides immediate retry', () => {
  assert.deepEqual(getChatError({ response: { status: 503, data: { code: 'AI_QUOTA_EXCEEDED' } } }), {
    message: 'Trợ lý AI đã đạt giới hạn sử dụng tạm thời. Vui lòng quay lại sau.', canRetry: false,
  })
})
test('Spa rate limit displays one-minute message and keeps retry', () => {
  assert.deepEqual(getChatError({ response: { status: 429, data: {} } }), {
    message: 'Bạn gửi quá nhiều câu hỏi. Vui lòng thử lại sau một phút.', canRetry: true,
  })
})
test('other errors display generic message and keep retry', () => {
  for (const error of [{ response: { status: 503, data: { message: 'private details' } } }, new Error('Network error')]) {
    assert.deepEqual(getChatError(error), {
      message: 'Trợ lý đang tạm thời không sẵn sàng. Vui lòng thử lại sau.', canRetry: true,
    })
  }
})
