const service = require('../services/invoiceService');
const wrap = handler => async (req, res, next) => {
  try { await handler(req, res); }
  catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (['ER_DUP_ENTRY','ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) return res.status(409).json({ message: 'Hóa đơn đã tồn tại hoặc dữ liệu đang được cập nhật. Vui lòng tải lại.' });
    next(error);
  }
};
exports.list = wrap(async (req, res) => res.json({ data: await service.list(req.user, req.query) }));
exports.detail = wrap(async (req, res) => res.json({ data: await service.list(req.user, {}, req.params.id) }));
exports.eligible = wrap(async (req, res) => res.json({ data: await service.eligible() }));
exports.create = wrap(async (req, res) => res.status(201).json({ data: await service.create(req.user, req.body) }));
