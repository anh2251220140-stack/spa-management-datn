const pool = require('../config/db');
const failure = (status, message) => Object.assign(new Error(message), { status });

async function authorize(connection, user, reviewId) {
  if (!/^[1-9]\d*$/.test(String(reviewId)) || Number(reviewId) > 4294967295) throw failure(400, 'ID không hợp lệ.');
  const [[review]] = await connection.execute(`SELECT r.id FROM reviews r
    JOIN appointments a ON a.id=r.appointment_id JOIN customers c ON c.id=a.customer_id
    WHERE r.id=? AND (?='admin' OR c.user_id=?)`, [reviewId, user.role, user.id]);
  if (!review) throw failure(404, 'Không tìm thấy đánh giá.');
}
const select = `SELECT rr.id,rr.review_id,rr.user_id,rr.message,
  DATE_FORMAT(rr.created_at,'%Y-%m-%d %H:%i:%s') created_at,u.role,
  CASE WHEN u.role='admin' THEN 'An Nhiên Spa' ELSE COALESCE(c.full_name,'Khách hàng') END sender_name
  FROM review_replies rr JOIN users u ON u.id=rr.user_id
  JOIN reviews r ON r.id=rr.review_id JOIN appointments a ON a.id=r.appointment_id
  JOIN customers c ON c.id=a.customer_id`;

async function list(user, reviewId) {
  await authorize(pool, user, reviewId);
  const [rows] = await pool.execute(select + ' WHERE rr.review_id=? ORDER BY rr.created_at ASC,rr.id ASC', [reviewId]);
  return rows;
}
async function create(user, reviewId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'message') || typeof body.message !== 'string') throw failure(400, 'Chỉ được gửi nội dung phản hồi dạng chuỗi.');
  const message = body.message.trim();
  if (!message || message.length > 2000) throw failure(400, 'Phản hồi phải có từ 1 đến 2000 ký tự.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await authorize(connection, user, reviewId);
    const [result] = await connection.execute('INSERT INTO review_replies (review_id,user_id,message) VALUES (?,?,?)', [reviewId, user.id, message]);
    const [[reply]] = await connection.execute(select + ' WHERE rr.id=?', [result.insertId]);
    await connection.commit();
    return reply;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
module.exports = { list, create };
