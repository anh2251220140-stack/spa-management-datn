const { rateLimit, MemoryStore } = require('express-rate-limit');
const store = new MemoryStore();
const limiter = rateLimit({
  windowMs: 60000, limit: 10, store,
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: { message: 'Bạn gửi quá nhiều câu hỏi. Vui lòng thử lại sau một phút.' },
});
module.exports = { limiter, store };
