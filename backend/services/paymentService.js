const pool = require('../config/db');
const { randomInt } = require('node:crypto');
const failure = (status, message) => Object.assign(new Error(message), { status });
const options = { timeout: 10000, maxRetries: 0 };
const fields = 'id,invoice_id,order_code,amount,status,checkout_url,qr_code,created_at';
function requireOnlineWindow(endAt) {
  const now = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
  if (!endAt || now >= endAt) throw failure(409, 'Lịch hẹn đã kết thúc. Vui lòng thanh toán trực tiếp tại Spa hoặc liên hệ Spa để được hỗ trợ.');
}

function redirect(name) {
  try {
    const url = new URL(process.env[name]);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch { throw failure(503, `Cấu hình ${name} chưa hợp lệ.`); }
}
function checkout(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'pay.payos.vn' && !url.username && !url.password; }
  catch { return false; }
}
async function create(user, value) {
  if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > 4294967295) throw failure(400, 'ID không hợp lệ.');
  const invoiceId = Number(value), connection = await pool.getConnection();
  let payment;
  try {
    await connection.beginTransaction();
    const [[invoice]] = await connection.execute(`SELECT i.*,DATE_FORMAT(a.end_at,'%Y-%m-%d %H:%i:%s') AS appointment_end_at FROM invoices i
      JOIN appointments a ON a.id=i.appointment_id JOIN customers c ON c.id=a.customer_id
      WHERE i.id=? AND c.user_id=? FOR UPDATE`, [invoiceId, user.id]);
    if (!invoice) throw failure(404, 'Không tìm thấy hóa đơn.');
    if (invoice.payment_status !== 'unpaid') throw failure(409, 'Hóa đơn đã thanh toán.');
    requireOnlineWindow(invoice.appointment_end_at);
    const amount = Number(invoice.total_amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw failure(400, 'Hóa đơn phải có số tiền nguyên dương.');
    const returnUrl = redirect('PAYOS_RETURN_URL'), cancelUrl = redirect('PAYOS_CANCEL_URL');
    const [[existing]] = await connection.execute("SELECT * FROM payments WHERE invoice_id=? AND status='pending' ORDER BY id DESC LIMIT 1 FOR UPDATE", [invoiceId]);
    payment = existing;
    if (payment && Number(payment.amount) !== amount) throw failure(409, 'Số tiền hóa đơn đã thay đổi. Vui lòng liên hệ quản trị viên.');
    if (payment?.checkout_url && checkout(payment.checkout_url)) {
      let remote;
      try { remote = await require('../config/payos').paymentRequests.get(Number(payment.order_code), options); }
      catch { throw failure(502, 'Chưa kiểm tra được liên kết hiện tại. Vui lòng thử lại sau.'); }
      if (Number(remote.orderCode) !== Number(payment.order_code) || Number(remote.amount) !== amount) throw failure(502, 'Thông tin thanh toán chưa khớp.');
      if (['CANCELLED', 'EXPIRED'].includes(remote.status) && Number(remote.amountPaid || 0) === 0) {
        await connection.execute("UPDATE payments SET status='cancelled' WHERE id=?", [payment.id]);
        payment = null;
      } else if (remote.status === 'PENDING' && Number(remote.amountPaid || 0) === 0) {
        requireOnlineWindow(invoice.appointment_end_at);
        await connection.commit();
        const [[saved]] = await connection.execute(`SELECT ${fields} FROM payments WHERE id=?`, [payment.id]);
        return { payment: saved, reused: true };
      } else throw failure(409, 'Giao dịch đang chờ xác nhận. Không tạo thanh toán mới.');
    }
    if (!payment) {
      requireOnlineWindow(invoice.appointment_end_at);
      // Timestamp + 3 chữ số ngẫu nhiên, UNIQUE trong DB và thử lại khi trùng.
      for (let attempt = 0; attempt < 5; attempt++) {
        const orderCode = Date.now() * 1000 + randomInt(1000);
        if (!Number.isSafeInteger(orderCode)) throw failure(503, 'Không thể cấp mã thanh toán.');
        try {
          const [row] = await connection.execute("INSERT INTO payments (invoice_id,provider,order_code,amount,status) VALUES (?,'payos',?,?,'pending')", [invoiceId, orderCode, amount]);
          payment = { id: row.insertId, order_code: orderCode }; break;
        } catch (error) { if (error.code !== 'ER_DUP_ENTRY') throw error; }
      }
      if (!payment) throw failure(409, 'Vui lòng thử lại để cấp mã thanh toán.');
    }
    // Lưu mã trước khi gọi mạng: timeout không làm mất dấu payment đã tạo ở payOS.
    await connection.commit();
    await connection.beginTransaction();
    const [[locked]] = await connection.execute('SELECT payment_status FROM invoices WHERE id=? FOR UPDATE', [invoiceId]);
    if (locked.payment_status !== 'unpaid') throw failure(409, 'Hóa đơn đã thanh toán.');
    requireOnlineWindow(invoice.appointment_end_at);
    const [[current]] = await connection.execute('SELECT * FROM payments WHERE id=? FOR UPDATE', [payment.id]);
    if (current.checkout_url && checkout(current.checkout_url)) {
      await connection.commit();
      const [[saved]] = await connection.execute(`SELECT ${fields} FROM payments WHERE id=?`, [payment.id]);
      return { payment: saved, reused: true };
    }
    const payos = require('../config/payos');
    let result;
    try {
      result = await payos.paymentRequests.create({
        orderCode: Number(current.order_code), amount,
        // Tối đa 9 ký tự, không chứa thông tin cá nhân.
        description: 'HD' + invoiceId.toString(36).toUpperCase(), returnUrl, cancelUrl,
      }, options);
    } catch {
      // Chỉ phục hồi cùng mã khi create lỗi; không polling hoặc xác nhận paid.
      try {
        const remote = await payos.paymentRequests.get(Number(current.order_code), options);
        if (Number(remote.orderCode) === Number(current.order_code) && Number(remote.amount) === amount && remote.status === 'PENDING' && /^[a-f0-9]{32}$/i.test(remote.id)) {
          result = { orderCode: remote.orderCode, amount: remote.amount, status: 'PENDING', checkoutUrl: `https://pay.payos.vn/web/${remote.id}`, qrCode: null };
        }
      } catch { /* Không log raw lỗi SDK vì có thể chứa credentials. */ }
      if (!result) throw failure(502, 'Chưa tạo được liên kết thanh toán. Vui lòng thử lại; hệ thống giữ nguyên mã để tránh tạo trùng.');
    }
    if (Number(result.orderCode) !== Number(current.order_code) || Number(result.amount) !== amount || result.status !== 'PENDING' || !checkout(result.checkoutUrl)) throw failure(502, 'Phản hồi thanh toán chưa hợp lệ. Vui lòng thử lại sau.');
    // paymentLinkId là mã link, không phải mã giao dịch chuyển tiền.
    await connection.execute('UPDATE payments SET checkout_url=?,qr_code=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [result.checkoutUrl, typeof result.qrCode === 'string' ? result.qrCode : null, payment.id]);
    await connection.commit();
    const [[saved]] = await connection.execute(`SELECT ${fields} FROM payments WHERE id=?`, [payment.id]);
    return { payment: saved, reused: Boolean(existing && existing.id === payment.id) };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
module.exports = { create };
