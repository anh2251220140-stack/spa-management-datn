const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const admin = require('../middleware/adminMiddleware');
const controller = require('../controllers/dashboardController');

router.get('/admin/dashboard', auth, admin, controller.get);
module.exports = router;
