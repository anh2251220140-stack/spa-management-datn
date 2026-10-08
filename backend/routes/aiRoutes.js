const router = require('express').Router();
const { limiter } = require('../middleware/aiRateLimiter');
router.post('/ai/chat', limiter, require('../controllers/aiController').chat);
module.exports = router;
