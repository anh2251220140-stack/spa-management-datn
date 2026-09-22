const pool = require('../config/db');
const fail = message => Object.assign(new Error(message), { status: 400 });
// DATETIME là giờ Việt Nam, trả chuỗi để tránh chuyển timezone theo máy chủ Node.
const select = `SELECT id,code,name,description,discount_type,discount_value,minimum_amount,max_discount_amount,status,
  DATE_FORMAT(start_at,'%Y-%m-%d %H:%i:%s') AS start_at,
  DATE_FORMAT(end_at,'%Y-%m-%d %H:%i:%s') AS end_at,
  DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') AS created_at,
  DATE_FORMAT(updated_at,'%Y-%m-%d %H:%i:%s') AS updated_at FROM promotions`;
function id(value) {
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 4294967295) throw fail('ID khuyến mãi không hợp lệ.');
  return Number(value);
}
function dateTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}[ T]([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)) throw fail('Ngày giờ không hợp lệ.');
  const normalized = value.replace('T', ' ') + (value.length === 16 ? ':00' : '');
  const parsed = new Date(normalized.replace(' ', 'T') + 'Z');
  if (normalized < '1000-01-01' || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 19).replace('T', ' ') !== normalized) throw fail('Ngày giờ không hợp lệ.');
  return normalized;
}
function amount(value, key, decimals, max, allowZero = false) {
  const pattern = decimals ? /^\d+(\.\d{1,2})?$/ : /^\d+(\.0{1,2})?$/;
  if (!['string', 'number'].includes(typeof value) || !pattern.test(String(value)) || !Number.isFinite(Number(value)) || Number(value) > max || (allowZero ? Number(value) < 0 : Number(value) <= 0)) {
    throw fail(`${key} không hợp lệ${decimals ? ' (tối đa 2 chữ số thập phân)' : ' (phải là số nguyên VNĐ)'}.`);
  }
  return Number(value);
}
function validate(body, old = {}) {
  const keys = ['code','name','description','discount_type','discount_value','minimum_amount','max_discount_amount','start_at','end_at','status'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !keys.includes(key)) || !Object.keys(body).length) throw fail('Dữ liệu khuyến mãi không hợp lệ.');
  const data = { description: null, minimum_amount: 0, max_discount_amount: null, status: 'active', ...old, ...body };
  for (const [key, max] of [['code', 50], ['name', 150]]) {
    if (typeof data[key] !== 'string' || !data[key].trim() || data[key].trim().length > max) throw fail(`${key === 'code' ? 'Mã' : 'Tên'} khuyến mãi là bắt buộc, tối đa ${max} ký tự.`);
    data[key] = data[key].trim();
  }
  data.code = data.code.toUpperCase();
  if (data.code.length > 50) throw fail('Mã khuyến mãi tối đa 50 ký tự.');
  if (data.description !== null && (typeof data.description !== 'string' || Buffer.byteLength(data.description) > 60000)) throw fail('Mô tả không hợp lệ hoặc quá dài.');
  if (!['percentage', 'fixed'].includes(data.discount_type)) throw fail('Loại giảm giá phải là percentage hoặc fixed.');
  if (!['active', 'inactive'].includes(data.status)) throw fail('Trạng thái không hợp lệ.');
  data.discount_value = amount(data.discount_value, 'Giá trị giảm', data.discount_type === 'percentage', 9999999999.99);
  if (data.discount_type === 'percentage' && data.discount_value > 100) throw fail('Phần trăm giảm phải lớn hơn 0 và không vượt quá 100.');
  data.minimum_amount = amount(data.minimum_amount, 'Giá trị đơn tối thiểu', false, 999999999999, true);
  if (data.max_discount_amount !== null) data.max_discount_amount = amount(data.max_discount_amount, 'Mức giảm tối đa', false, 999999999999);
  if (data.discount_type === 'fixed' && data.max_discount_amount !== null) throw fail('Giảm số tiền cố định không dùng mức giảm tối đa.');
  data.start_at = dateTime(data.start_at); data.end_at = dateTime(data.end_at);
  if (data.start_at >= data.end_at) throw fail('Thời gian bắt đầu phải trước thời gian kết thúc.');
  return data;
}
const wrap = handler => async (req, res, next) => {
  try { await handler(req, res); }
  catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Mã khuyến mãi đã tồn tại.' });
    next(error);
  }
};
exports.list = wrap(async (req, res) => {
  const [rows] = await pool.query(select + ' ORDER BY id DESC');
  res.json({ data: rows });
});
exports.active = wrap(async (req, res) => {
  const [rows] = await pool.query(select + " WHERE status='active' AND start_at <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR) AND end_at > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR) ORDER BY end_at,id");
  res.json({ data: rows });
});
exports.detail = wrap(async (req, res) => {
  const [[row]] = await pool.execute(select + ' WHERE id=?', [id(req.params.id)]);
  if (!row) return res.status(404).json({ message: 'Không tìm thấy khuyến mãi.' });
  res.json({ data: row });
});
exports.save = wrap(async (req, res) => {
  const promotionId = req.params.id ? id(req.params.id) : null;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let old = {};
    if (promotionId) {
      const [[row]] = await connection.execute(select + ' WHERE id=? FOR UPDATE', [promotionId]);
      if (!row) { await connection.rollback(); return res.status(404).json({ message: 'Không tìm thấy khuyến mãi.' }); }
      old = row;
    }
    const data = validate(req.body, old);
    const values = [data.code,data.name,data.description,data.discount_type,data.discount_value,data.minimum_amount,data.max_discount_amount,data.start_at,data.end_at,data.status];
    let resultId = promotionId;
    if (promotionId) await connection.execute('UPDATE promotions SET code=?,name=?,description=?,discount_type=?,discount_value=?,minimum_amount=?,max_discount_amount=?,start_at=?,end_at=?,status=? WHERE id=?', [...values, promotionId]);
    else {
      const [result] = await connection.execute('INSERT INTO promotions (code,name,description,discount_type,discount_value,minimum_amount,max_discount_amount,start_at,end_at,status) VALUES (?,?,?,?,?,?,?,?,?,?)', values);
      resultId = result.insertId;
    }
    const [[row]] = await connection.execute(select + ' WHERE id=?', [resultId]);
    await connection.commit();
    res.status(promotionId ? 200 : 201).json({ data: row });
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
});
exports.status = (req, res, next) => {
  if (!req.body || Object.keys(req.body).length !== 1 || !['active','inactive'].includes(req.body.status)) return res.status(400).json({ message: 'Chỉ gửi status active hoặc inactive.' });
  return exports.save(req, res, next);
};
