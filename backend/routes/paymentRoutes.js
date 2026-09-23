const router = require('express').Router();
// Public nhưng bắt buộc xác minh chữ ký SDK; không dùng JWT.
router.post('/payments/payos/webhook', require('../controllers/paymentController').webhook);
module.exports = router;
