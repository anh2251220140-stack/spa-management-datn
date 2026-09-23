const pool = require('../config/db');
const failure = (status, message) => Object.assign(new Error(message), { status });
function paidTime(value) {
  const now = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) || value < '2000-01-01 00:00:00' || value > now) return now;
  const parsed = new Date(value.replace(' ', 'T') + 'Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 19).replace('T', ' ') === value ? value : now;
}
async function receive(body) {
  const payos = require('../config/payos');
  let data;
  try { data = await payos.webhooks.verify(body); }
  catch { throw failure(400, 'Webhook không hợp lệ.'); }
  // Chỉ tin code trong data đã ký, không tin success/code bên ngoài chữ ký.
  if (!data || typeof data !== 'object') throw failure(400, 'Dữ liệu webhook không hợp lệ.');
  if (data.code !== '00') return;
  if (!Number.isSafeInteger(data.orderCode) || data.orderCode <= 0 || !Number.isSafeInteger(data.amount) || data.amount <= 0 || data.currency !== 'VND') throw failure(400, 'Mã thanh toán, số tiền hoặc tiền tệ không hợp lệ.');
  const reference = data.reference == null || data.reference === '' ? null : data.reference;
  if (reference !== null && (typeof reference !== 'string' || !reference.trim() || reference.length > 255)) throw failure(400, 'Mã giao dịch không hợp lệ.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[candidate]] = await connection.execute("SELECT id,invoice_id FROM payments WHERE provider='payos' AND order_code=?", [data.orderCode]);
    // ACK cả mã không thuộc hệ thống (bao gồm webhook kiểm tra URL); không tạo dữ liệu.
    if (!candidate) { await connection.commit(); return; }
    // Cùng thứ tự khóa với create payment để tránh deadlock.
    const [[invoice]] = await connection.execute('SELECT * FROM invoices WHERE id=? FOR UPDATE', [candidate.invoice_id]);
    const [[payment]] = await connection.execute("SELECT * FROM payments WHERE id=? AND provider='payos' AND order_code=? FOR UPDATE", [candidate.id, data.orderCode]);
    if (!invoice || !payment) throw failure(409, 'Dữ liệu thanh toán đã thay đổi.');
    if (String(data.amount) !== String(payment.amount) || String(payment.amount) !== String(invoice.total_amount)) throw failure(400, 'Số tiền thanh toán không khớp.');
    if (payment.status === 'paid') {
      if (payment.provider_transaction_id !== reference) throw failure(409, 'Mã giao dịch không khớp thanh toán đã ghi nhận.');
      if (invoice.payment_status !== 'paid') throw failure(409, 'Trạng thái thanh toán chưa nhất quán.');
      await connection.commit(); return;
    }
    const paidAt = paidTime(data.transactionDateTime);
    await connection.execute("UPDATE payments SET status='paid',payment_method='bank_transfer',paid_at=?,provider_transaction_id=? WHERE id=?", [paidAt, reference, payment.id]);
    // Nếu một attempt khác đã trả tiền trước đó, giữ mốc paid_at đầu tiên của hóa đơn.
    if (invoice.payment_status === 'unpaid') await connection.execute("UPDATE invoices SET payment_status='paid',payment_method='bank_transfer',paid_at=? WHERE id=?", [paidAt, invoice.id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') throw failure(409, 'Mã giao dịch đã được ghi nhận cho thanh toán khác.');
    throw error;
  } finally { connection.release(); }
}
module.exports = { receive };
