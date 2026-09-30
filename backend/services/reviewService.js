const pool = require('../config/db');
const failure = (status, message) => Object.assign(new Error(message), { status });
function id(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > 4294967295) throw failure(400, 'ID không hợp lệ.');
  return Number(value);
}
function input(body, editing) {
  const allowed = editing ? ['rating', 'comment'] : ['appointment_id', 'rating', 'comment'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) throw failure(400, 'Dữ liệu đánh giá không hợp lệ. Không được thay đổi lịch hẹn khi sửa.');
  if ((!editing || body.rating !== undefined) && (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5)) throw failure(400, 'Số sao phải là số nguyên từ 1 đến 5.');
  if (body.comment != null && typeof body.comment !== 'string') throw failure(400, 'Nhận xét phải là chuỗi.');
  const comment = body.comment?.trim() || null;
  if (comment && comment.length > 2000) throw failure(400, 'Nhận xét tối đa 2000 ký tự.');
  return { rating: body.rating, comment };
}
const select = `SELECT r.id,r.appointment_id,r.rating,r.comment,r.content_version,
  DATE_FORMAT(r.created_at,'%Y-%m-%d %H:%i:%s') created_at,
  DATE_FORMAT(r.updated_at,'%Y-%m-%d %H:%i:%s') updated_at,
  c.full_name customer_name,a.service_name_snapshot service_name
  FROM reviews r JOIN appointments a ON a.id=r.appointment_id JOIN customers c ON c.id=a.customer_id`;
async function own(user, appointmentId) {
  appointmentId = id(appointmentId);
  const [[appointment]] = await pool.execute('SELECT a.id FROM appointments a JOIN customers c ON c.id=a.customer_id WHERE a.id=? AND c.user_id=?', [appointmentId, user.id]);
  if (!appointment) throw failure(404, 'Không tìm thấy lịch hẹn.');
  const [[review]] = await pool.execute(select + ' WHERE r.appointment_id=? AND c.user_id=?', [appointmentId, user.id]);
  return review || null;
}
async function admin(reviewId) {
  const [rows] = await pool.execute(select + (reviewId === undefined ? ' ORDER BY r.id DESC' : ' WHERE r.id=?'), reviewId === undefined ? [] : [id(reviewId)]);
  if (reviewId !== undefined && !rows.length) throw failure(404, 'Không tìm thấy đánh giá.');
  return reviewId === undefined ? rows : rows[0];
}
async function save(user, body, reviewId) {
  const editing = reviewId !== undefined, values = input(body, editing);
  const targetId = id(editing ? reviewId : body.appointment_id);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (editing) {
      const [[current]] = await connection.execute(`SELECT r.* FROM reviews r JOIN appointments a ON a.id=r.appointment_id
        JOIN customers c ON c.id=a.customer_id WHERE r.id=? AND c.user_id=? FOR UPDATE`, [targetId, user.id]);
      if (!current) throw failure(404, 'Không tìm thấy đánh giá.');
      const rating = body.rating === undefined ? current.rating : values.rating;
      const comment = body.comment === undefined ? current.comment : values.comment;
      if (rating !== current.rating || comment !== current.comment) await connection.execute('UPDATE reviews SET rating=?,comment=?,content_version=content_version+1 WHERE id=?', [rating, comment, targetId]);
    } else {
      const [[appointment]] = await connection.execute(`SELECT a.status FROM appointments a JOIN customers c ON c.id=a.customer_id
        WHERE a.id=? AND c.user_id=? FOR UPDATE`, [targetId, user.id]);
      if (!appointment) throw failure(404, 'Không tìm thấy lịch hẹn.');
      if (appointment.status !== 'completed') throw failure(409, 'Chỉ được đánh giá lịch hẹn đã hoàn thành.');
      await connection.execute('INSERT INTO reviews (appointment_id,rating,comment) VALUES (?,?,?)', [targetId, values.rating, values.comment]);
    }
    const [[saved]] = await connection.execute(select + (editing ? ' WHERE r.id=?' : ' WHERE r.appointment_id=?'), [targetId]);
    await connection.commit(); return saved;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
module.exports = { own, admin, save };

// Chỉ chọn các trường được phép công khai, không dùng response quản trị.
async function publicByService(serviceId) {
  serviceId = id(serviceId);
  const [[service]] = await pool.execute(`SELECT s.id FROM services s JOIN service_categories c ON c.id=s.category_id
    WHERE s.id=? AND s.status='active' AND c.status='active'`, [serviceId]);
  if (!service) throw failure(404, 'Dịch vụ không tồn tại hoặc đã ngừng cung cấp.');
  const [reviews] = await pool.execute(`SELECT r.id review_id,c.full_name customer_name,r.rating,r.comment,
    DATE_FORMAT(r.created_at,'%Y-%m-%d %H:%i:%s') created_at
    FROM reviews r JOIN appointments a ON a.id=r.appointment_id JOIN customers c ON c.id=a.customer_id
    WHERE a.service_id=? AND a.status='completed' ORDER BY r.created_at DESC,r.id DESC`, [serviceId]);
  const [replies] = await pool.execute(`SELECT rr.id,rr.review_id,rr.message,
    DATE_FORMAT(rr.created_at,'%Y-%m-%d %H:%i:%s') created_at,
    CASE WHEN u.role='admin' THEN 'An Nhiên Spa' ELSE COALESCE(c.full_name,'Khách hàng') END sender_label
    FROM review_replies rr JOIN users u ON u.id=rr.user_id JOIN reviews r ON r.id=rr.review_id
    JOIN appointments a ON a.id=r.appointment_id LEFT JOIN customers c ON c.user_id=rr.user_id
    WHERE a.service_id=? AND a.status='completed' ORDER BY rr.created_at ASC,rr.id ASC`, [serviceId]);
  const byId = new Map(reviews.map(review => [review.review_id, { ...review, replies: [] }]));
  for (const { review_id, ...reply } of replies) byId.get(review_id)?.replies.push(reply);
  return { service_id: serviceId, average_rating: reviews.length ? Math.round(reviews.reduce((sum,review) => sum + review.rating,0) / reviews.length * 10) / 10 : 0,
    total_reviews: reviews.length, reviews: [...byId.values()] };
}
module.exports.publicByService = publicByService;
