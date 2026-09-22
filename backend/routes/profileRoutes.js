const router = require('express').Router();
const authMiddleware = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const controller = require('../controllers/profileController');

router.use(authMiddleware, (req, res, next) => {
  if (req.user.role !== 'user') return res.status(403).json({ message: 'Hồ sơ này dành cho khách hàng.' });
  next();
});
router.get('/me', controller.getProfile);
// Avatar dùng field image và cùng quy tắc kiểm tra ảnh với dịch vụ.
router.patch('/me', upload, controller.updateProfile);
module.exports = router;
