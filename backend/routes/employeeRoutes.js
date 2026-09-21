const router = require('express').Router();
const controller = require('../controllers/employeeController');
const auth = require('../middleware/authMiddleware');
const admin = require('../middleware/adminMiddleware');

router.use(auth, admin);
router.get('/employees', controller.list);
router.get('/employees/:id', controller.detail);
router.post('/employees', controller.save);
router.patch('/employees/:id', controller.save);
router.get('/employee-services', controller.listAssignments);
router.post('/employee-services', controller.createAssignment);
router.patch('/employee-services/:employeeId/:serviceId', controller.updateAssignment);
router.get('/employee-schedules', controller.listSchedules);
router.post('/employee-schedules', controller.saveSchedule);
router.patch('/employee-schedules/:id', controller.saveSchedule);
module.exports = router;
