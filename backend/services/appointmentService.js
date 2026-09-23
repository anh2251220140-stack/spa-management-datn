const pool = require('../config/db');
const error = (status, message) => Object.assign(new Error(message), { status });
function id(value) {
  if (!['string', 'number'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) || Number(value) > 4294967295) throw error(400, 'ID không hợp lệ.');
  return Number(value);
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01') throw error(400, 'Ngày không hợp lệ.');
  const parsed = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw error(400, 'Ngày không hợp lệ.');
  return value;
}
// DATETIME trong database là giờ địa phương Spa (UTC+7), không phụ thuộc timezone máy chạy Node.
const now = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
function startAt(day, time) {
  date(day);
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw error(400, 'Giờ phải có dạng HH:mm.');
  return `${day} ${time}:00`;
}
function endAt(start, minutes) {
  const end = new Date(Date.parse(start.replace(' ', 'T') + 'Z') + minutes * 60000).toISOString().slice(0, 19).replace('T', ' ');
  if (end.slice(0, 10) !== start.slice(0, 10)) throw error(400, 'Dịch vụ phải kết thúc trong cùng ngày.');
  return end;
}
function note(value, max = 2000) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.trim().length > max) throw error(400, 'Ghi chú hoặc lý do quá dài/không hợp lệ.');
  return value.trim() || null;
}
async function customer(connection, userId, lock = false) {
  const [rows] = await connection.execute('SELECT id,status FROM customers WHERE user_id=?' + (lock ? ' FOR UPDATE' : ''), [userId]);
  if (!rows.length || rows[0].status !== 'active') throw error(403, 'Cần hồ sơ khách hàng đang hoạt động để đặt lịch.');
  return rows[0];
}
async function service(connection, serviceId, lock = false) {
  const [rows] = await connection.execute("SELECT s.* FROM services s JOIN service_categories c ON c.id=s.category_id WHERE s.id=? AND s.status='active' AND c.status='active'" + (lock ? ' LOCK IN SHARE MODE' : ''), [serviceId]);
  if (!rows.length) throw error(404, 'Dịch vụ hoặc danh mục không còn hoạt động.');
  return rows[0];
}
async function assignment(connection, employeeId, serviceId, lock = false) {
  const [employees] = await connection.execute('SELECT id,status FROM employees WHERE id=?' + (lock ? ' FOR UPDATE' : ''), [employeeId]);
  if (!employees.length || employees[0].status !== 'active') throw error(400, 'Nhân viên không còn hoạt động.');
  const [rows] = await connection.execute("SELECT employee_id FROM employee_services WHERE employee_id=? AND service_id=? AND status='active'" + (lock ? ' LOCK IN SHARE MODE' : ''), [employeeId, serviceId]);
  if (!rows.length) throw error(400, 'Nhân viên chưa được phân công dịch vụ này.');
}
async function calendar(connection, employeeId, customerId, day, lock = false) {
  const [shifts] = await connection.execute('SELECT start_time,end_time,status FROM employee_schedules WHERE employee_id=? AND work_date=?' + (lock ? ' FOR UPDATE' : ''), [employeeId, day]);
  const [busy] = await connection.execute("SELECT DATE_FORMAT(start_at,'%Y-%m-%d %H:%i:%s') AS start_at, DATE_FORMAT(end_at,'%Y-%m-%d %H:%i:%s') AS end_at FROM appointments WHERE (employee_id=? OR customer_id=?) AND status <> 'cancelled' AND start_at < ? AND end_at > ?" + (lock ? ' FOR UPDATE' : ''), [employeeId, customerId, day + ' 23:59:59', day + ' 00:00:00']);
  return { shifts, busy };
}
function available(start, end, calendarData) {
  const from = start.slice(11), to = end.slice(11);
  return calendarData.shifts.some(s => s.status === 'working' && s.start_time <= from && s.end_time >= to)
    && !calendarData.shifts.some(s => s.status === 'off' && from < s.end_time && to > s.start_time)
    && !calendarData.busy.some(a => start < a.end_at && end > a.start_at);
}
const select = `SELECT a.id,a.customer_id,a.employee_id,a.service_id,a.service_name_snapshot,a.booked_price,a.status,a.note,a.cancel_reason,
  DATE_FORMAT(a.start_at,'%Y-%m-%d %H:%i:%s') AS start_at, DATE_FORMAT(a.end_at,'%Y-%m-%d %H:%i:%s') AS end_at,
  DATE_FORMAT(a.cancelled_at,'%Y-%m-%d %H:%i:%s') AS cancelled_at,
  TIMESTAMPDIFF(MINUTE,a.start_at,a.end_at) AS duration_minutes,
  e.full_name AS employee_name,c.full_name AS customer_name,c.phone AS customer_phone
  FROM appointments a JOIN employees e ON e.id=a.employee_id JOIN customers c ON c.id=a.customer_id`;

async function employees(serviceId) {
  serviceId = id(serviceId); await service(pool, serviceId);
  const [rows] = await pool.execute("SELECT e.id,e.full_name,e.specialty,e.experience_years FROM employees e JOIN employee_services es ON es.employee_id=e.id WHERE es.service_id=? AND es.status='active' AND e.status='active' ORDER BY e.full_name", [serviceId]);
  return rows;
}
async function slots(userId, query) {
  const serviceId = id(query.service_id), employeeId = id(query.employee_id), day = date(query.date);
  const profile = await customer(pool, userId);
  const chosen = await service(pool, serviceId);
  await assignment(pool, employeeId, serviceId);
  const data = await calendar(pool, employeeId, profile.id, day);
  const results = [];
  // Mỗi 15 phút là một giờ gợi ý. POST vẫn kiểm tra lại toàn bộ trong transaction.
  for (let minute = 0; minute + chosen.duration_minutes < 1440; minute += 15) {
    const time = String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
    const start = startAt(day, time), end = endAt(start, chosen.duration_minutes);
    if (start > now() && available(start, end, data)) results.push({ start_time: time, end_time: end.slice(11, 16) });
  }
  return { date: day, service_id: serviceId, employee_id: employeeId, slots: results };
}
async function create(userId, body) {
  const serviceId = id(body.service_id), employeeId = id(body.employee_id);
  const start = startAt(body.date, body.start_time), memo = note(body.note);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Thống nhất khóa khách trước, rồi nhân viên. Hai request cùng khách/nhân viên phải đợi nhau.
    const profile = await customer(connection, userId, true);
    await assignment(connection, employeeId, serviceId, true);
    const chosen = await service(connection, serviceId, true);
    const end = endAt(start, chosen.duration_minutes);
    if (start <= now()) throw error(400, 'Chỉ được đặt lịch trong tương lai.');
    const data = await calendar(connection, employeeId, profile.id, body.date, true);
    if (!available(start, end, data)) throw error(409, 'Giờ đã chọn không khả dụng: ngoài ca làm, trong ca nghỉ hoặc trùng lịch nhân viên/khách hàng.');
    const [result] = await connection.execute("INSERT INTO appointments (customer_id,employee_id,service_id,start_at,end_at,service_name_snapshot,booked_price,status,note) VALUES (?,?,?,?,?,?,?,'pending',?)", [profile.id, employeeId, serviceId, start, end, chosen.name, chosen.price, memo]);
    const [rows] = await connection.execute(select + ' WHERE a.id=?', [result.insertId]);
    await connection.commit(); return rows[0];
  } catch (failure) { await connection.rollback(); throw failure; }
  finally { connection.release(); }
}
async function list(user, query, appointmentId) {
  const conditions = [], values = [];
  if (user.role !== 'admin') { conditions.push('c.user_id=?'); values.push(user.id); }
  if (appointmentId !== undefined) { conditions.push('a.id=?'); values.push(id(appointmentId)); }
  if (query.date !== undefined) { const day = date(query.date); conditions.push('a.start_at >= ? AND a.start_at <= ?'); values.push(day + ' 00:00:00', day + ' 23:59:59'); }
  if (query.status !== undefined) {
    if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(query.status)) throw error(400, 'Trạng thái không hợp lệ.');
    conditions.push('a.status=?'); values.push(query.status);
  }
  const [rows] = await pool.execute(select + (conditions.length ? ' WHERE ' + conditions.join(' AND ') : '') + ' ORDER BY a.start_at DESC,a.id DESC', values);
  if (appointmentId !== undefined && !rows.length) throw error(404, 'Không tìm thấy lịch hẹn.');
  return appointmentId !== undefined ? rows[0] : rows;
}
async function updateStatus(user, appointmentId, body) {
  appointmentId = id(appointmentId);
  const target = user.role === 'admin' ? body.status : 'cancelled';
  if (!['confirmed', 'completed', 'cancelled'].includes(target)) throw error(400, 'Trạng thái không hợp lệ.');
  const reason = target === 'cancelled' ? note(body.cancel_reason, 255) : null;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(select + ' WHERE a.id=?' + (user.role === 'admin' ? '' : ' AND c.user_id=?') + ' FOR UPDATE', user.role === 'admin' ? [appointmentId] : [appointmentId, user.id]);
    const old = rows[0];
    if (!old) throw error(404, 'Không tìm thấy lịch hẹn.');
    if (target === 'cancelled') {
      // Khóa invoice để kiểm tra trạng thái mới nhất, không đua với webhook.
      const [[invoice]] = await connection.execute('SELECT payment_status FROM invoices WHERE appointment_id=? FOR UPDATE', [appointmentId]);
      if (invoice?.payment_status === 'paid') throw error(409, 'Lịch hẹn đã thanh toán. Vui lòng liên hệ Spa để được hỗ trợ hủy.');
    }
    const allowed = { pending: ['confirmed', 'cancelled'], confirmed: ['completed', 'cancelled'], completed: [], cancelled: [] };
    if (!allowed[old.status].includes(target)) throw error(409, 'Không thể chuyển trạng thái lịch hẹn này.');
    if (user.role !== 'admin' && old.start_at <= now()) throw error(409, 'Không thể hủy lịch đã đến giờ bắt đầu.');
    if (target === 'confirmed' && old.start_at <= now()) throw error(409, 'Lịch đã đến giờ bắt đầu, không thể xác nhận mới.');
    if (target === 'completed' && old.end_at > now()) throw error(409, 'Chưa đến giờ kết thúc dịch vụ.');
    await connection.execute('UPDATE appointments SET status=?,cancel_reason=?,cancelled_at=? WHERE id=?', [target, reason, target === 'cancelled' ? now() : null, appointmentId]);
    const [updated] = await connection.execute(select + ' WHERE a.id=?', [appointmentId]);
    await connection.commit(); return updated[0];
  } catch (failure) { await connection.rollback(); throw failure; }
  finally { connection.release(); }
}
module.exports = { employees, slots, create, list, updateStatus };
