const pool = require('../config/db');
const { randomBytes } = require('node:crypto');
const failure = (status, message) => Object.assign(new Error(message), { status });
function id(value) {
  if (!['string','number'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) || Number(value) > 4294967295) throw failure(400, 'ID không hợp lệ.');
  return Number(value);
}
const now = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
const select = `SELECT i.*,a.customer_id,c.full_name AS customer_name,c.phone AS customer_phone,
  d.service_id,d.service_name_snapshot,
  DATE_FORMAT(a.start_at,'%Y-%m-%d %H:%i:%s') AS appointment_start_at,
  DATE_FORMAT(a.end_at,'%Y-%m-%d %H:%i:%s') AS appointment_end_at,
  DATE_FORMAT(i.created_at,'%Y-%m-%d %H:%i:%s') AS created_at,
  DATE_FORMAT(i.updated_at,'%Y-%m-%d %H:%i:%s') AS updated_at,
  DATE_FORMAT(i.paid_at,'%Y-%m-%d %H:%i:%s') AS paid_at,
  DATE_FORMAT(i.promotion_applied_at,'%Y-%m-%d %H:%i:%s') AS promotion_applied_at
  FROM invoices i JOIN appointments a ON a.id=i.appointment_id JOIN customers c ON c.id=a.customer_id
  JOIN invoice_details d ON d.invoice_id=i.id`;
async function list(user, query = {}, invoiceId) {
  const where = [], values = [];
  if (user.role !== 'admin') { where.push('c.user_id=?'); values.push(user.id); }
  if (invoiceId !== undefined) { where.push('i.id=?'); values.push(id(invoiceId)); }
  if (query.payment_status !== undefined) {
    if (!['unpaid','paid'].includes(query.payment_status)) throw failure(400, 'Trạng thái thanh toán không hợp lệ.');
    where.push('i.payment_status=?'); values.push(query.payment_status);
  }
  if (query.date !== undefined) {
    const date = query.date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1000-01-01') throw failure(400, 'Ngày không hợp lệ.');
    const parsed = new Date(date + 'T00:00:00Z');
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw failure(400, 'Ngày không hợp lệ.');
    where.push('DATE(i.created_at)=?'); values.push(date);
  }
  const [rows] = await pool.execute(select + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY i.id DESC', values);
  if (invoiceId === undefined) return rows;
  if (!rows.length) throw failure(404, 'Không tìm thấy hóa đơn.');
  const [details] = await pool.execute('SELECT id,invoice_id,service_id,service_name_snapshot,quantity,unit_price,total_price FROM invoice_details WHERE invoice_id=? ORDER BY id', [id(invoiceId)]);
  return { ...rows[0], details };
}
async function eligible() {
  const [rows] = await pool.query(`SELECT a.id,a.customer_id,c.full_name AS customer_name,a.service_name_snapshot,a.booked_price,
    DATE_FORMAT(a.start_at,'%Y-%m-%d %H:%i:%s') AS start_at
    FROM appointments a JOIN customers c ON c.id=a.customer_id
    WHERE a.status='completed' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.appointment_id=a.id)
    ORDER BY a.start_at DESC,a.id DESC`);
  return rows;
}
async function create(user, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['appointment_id','promotion_id','note'].includes(key))) throw failure(400, 'Chỉ gửi lịch hẹn, khuyến mãi và ghi chú; giá do hệ thống tính.');
  const appointmentId = id(body.appointment_id);
  const promotionId = body.promotion_id == null ? null : id(body.promotion_id);
  if (body.note != null && (typeof body.note !== 'string' || body.note.length > 2000)) throw failure(400, 'Ghi chú tối đa 2000 ký tự.');
  const connection = await pool.getConnection();
  let invoiceId;
  try {
    await connection.beginTransaction();
    // Khóa lịch hẹn: hai yêu cầu cùng lúc không tạo được hai hóa đơn.
    const [[appointment]] = await connection.execute('SELECT * FROM appointments WHERE id=? FOR UPDATE', [appointmentId]);
    if (!appointment) throw failure(404, 'Không tìm thấy lịch hẹn.');
    if (appointment.status !== 'completed') throw failure(409, 'Chỉ tạo hóa đơn cho lịch hẹn đã hoàn thành.');
    const [[existing]] = await connection.execute('SELECT id FROM invoices WHERE appointment_id=?', [appointmentId]);
    if (existing) throw failure(409, 'Lịch hẹn đã có hóa đơn.');
    let promotion = null;
    if (promotionId) {
      const [[row]] = await connection.execute(`SELECT *,DATE_FORMAT(start_at,'%Y-%m-%d %H:%i:%s') AS start_at,
        DATE_FORMAT(end_at,'%Y-%m-%d %H:%i:%s') AS end_at FROM promotions WHERE id=? LOCK IN SHARE MODE`, [promotionId]);
      if (!row) throw failure(404, 'Không tìm thấy khuyến mãi.');
      promotion = row;
    }
    const current = now();
    const subtotal = BigInt(appointment.booked_price);
    let discount = 0n;
    if (promotion) {
      if (promotion.status !== 'active' || promotion.start_at > current || promotion.end_at <= current) throw failure(400, 'Khuyến mãi không đang trong thời gian hiệu lực hoặc đã bị tắt.');
      if (subtotal < BigInt(promotion.minimum_amount)) throw failure(400, 'Giá trị hóa đơn chưa đạt mức tối thiểu của khuyến mãi.');
      if (promotion.discount_type === 'percentage') {
        const [whole, fraction = ''] = String(promotion.discount_value).split('.');
        const hundredths = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
        // Làm tròn nửa lên một đồng; BigInt tránh sai số khi tiền lớn.
        discount = (subtotal * hundredths + 5000n) / 10000n;
        if (promotion.max_discount_amount !== null && discount > BigInt(promotion.max_discount_amount)) discount = BigInt(promotion.max_discount_amount);
      } else discount = BigInt(String(promotion.discount_value).split('.')[0]);
      if (discount > subtotal) discount = subtotal;
    }
    const invoiceCode = 'INV-' + randomBytes(12).toString('hex').toUpperCase();
    const [result] = await connection.execute(`INSERT INTO invoices
      (invoice_code,appointment_id,promotion_id,promotion_code_snapshot,discount_type_snapshot,discount_value_snapshot,max_discount_snapshot,promotion_applied_at,
       subtotal,discount_amount,total_amount,payment_status,note,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'unpaid',?,?,?)`,
    [invoiceCode,appointmentId,promotionId,promotion?.code ?? null,promotion?.discount_type ?? null,promotion?.discount_value ?? null,promotion?.max_discount_amount ?? null,promotion ? current : null,
      subtotal.toString(),discount.toString(),(subtotal-discount).toString(),body.note?.trim() || null,current,current]);
    invoiceId = result.insertId;
    await connection.execute('INSERT INTO invoice_details (invoice_id,service_id,service_name_snapshot,quantity,unit_price) VALUES (?,?,?,1,?)',
      [invoiceId,appointment.service_id,appointment.service_name_snapshot,appointment.booked_price]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  return list(user, {}, invoiceId);
}
module.exports = { list, eligible, create };
