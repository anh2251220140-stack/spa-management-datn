const service = require('../services/reviewService');
const wrap = handler => async (req, res, next) => {
  try { await handler(req, res); }
  catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Lịch hẹn này đã được đánh giá.' });
    if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) return res.status(409).json({ message: 'Đánh giá đang được cập nhật. Vui lòng thử lại.' });
    next(error);
  }
};
exports.create = wrap(async (req, res) => res.status(201).json({ data: await service.save(req.user, req.body) }));
exports.update = wrap(async (req, res) => res.json({ data: await service.save(req.user, req.body, req.params.id) }));
exports.own = wrap(async (req, res) => res.json({ data: await service.own(req.user, req.params.appointmentId) }));
exports.list = wrap(async (req, res) => res.json({ data: await service.admin() }));
exports.detail = wrap(async (req, res) => res.json({ data: await service.admin(req.params.id) }));

const replies = require('../services/reviewReplyService');
exports.listReplies = wrap(async (req, res) => res.json({ data: await replies.list(req.user, req.params.reviewId) }));
exports.createReply = wrap(async (req, res) => res.status(201).json({ data: await replies.create(req.user, req.params.reviewId, req.body) }));

exports.publicByService = wrap(async (req, res) => res.json({ data: await service.publicByService(req.params.serviceId) }));
