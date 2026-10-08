const service = require('../services/aiChatService');
exports.chat = async (req, res) => {
  try { res.json({ data: { reply: await service.chat(req.body) } }); }
  catch (error) {
    // Không chuyển lỗi provider ra middleware log chung.
    const safe = error.aiSafe === true;
    const body = { message: safe ? error.message : 'Trợ lý đang tạm thời không sẵn sàng. Vui lòng thử lại sau.' };
    if (safe && error.code === 'AI_QUOTA_EXCEEDED') body.code = 'AI_QUOTA_EXCEEDED';
    res.status(safe ? error.status : 503).json(body);
  }
};
