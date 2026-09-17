const express = require('express');
const controller = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

const router = express.Router();
router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/me', authMiddleware, controller.getMe);
router.patch('/change-password', authMiddleware, controller.changePassword);
router.get('/admin-check', authMiddleware, adminMiddleware, (req, res) => {
  res.json({ message: 'Admin access granted' });
});

module.exports = router;
