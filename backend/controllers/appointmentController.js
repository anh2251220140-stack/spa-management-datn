const service = require('../services/appointmentService');
const wrap = handler => async (req, res, next) => {
  try { await handler(req, res); }
  catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ER_NO_REFERENCED_ROW_2'].includes(error.code)) return res.status(409).json({ message: 'Dữ liệu vừa thay đổi hoặc đang được đặt. Vui lòng tải lại giờ trống và thử lại.' });
    next(error);
  }
};
exports.employees = wrap(async (req, res) => res.json({ data: await service.employees(req.query.service_id) }));
exports.slots = wrap(async (req, res) => res.json({ data: await service.slots(req.user.id, req.query) }));
exports.create = wrap(async (req, res) => res.status(201).json({ data: await service.create(req.user.id, req.body || {}) }));
exports.list = wrap(async (req, res) => res.json({ data: await service.list(req.user, req.query) }));
exports.detail = wrap(async (req, res) => res.json({ data: await service.list(req.user, {}, req.params.id) }));
exports.updateStatus = wrap(async (req, res) => res.json({ data: await service.updateStatus(req.user, req.params.id, req.body || {}) }));
