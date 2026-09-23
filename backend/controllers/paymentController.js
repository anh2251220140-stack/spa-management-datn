const service = require('../services/paymentService');
exports.webhook = async (req, res) => {
  try {
    await require('../services/paymentWebhookService').receive(req.body);
    res.status(200).json({ code: '00', desc: 'success' });
  } catch (error) {
    // Không log payload, lỗi SDK hoặc dữ liệu ngân hàng.
    res.status([400, 409].includes(error.status) ? error.status : 500).json({ message: error.status === 400 || error.status === 409 ? error.message : 'Không thể xử lý webhook. Vui lòng gửi lại.' });
  }
};
exports.create = async (req, res, next) => {
  try {
    const result = await service.create(req.user, req.params.id);
    res.status(result.reused ? 200 : 201).json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) return res.status(409).json({ message: 'Thanh toán đang được xử lý. Vui lòng thử lại.' });
    next(error);
  }
};
