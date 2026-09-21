const pool = require('../config/db');

function fail(status, message) { return Object.assign(new Error(message), { status }); }
function id(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > 4294967295) throw fail(400, 'ID không hợp lệ.');
  return Number(value);
}
function text(value, max, required = false) {
  if (value == null && !required) return null;
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw fail(400, 'Thông tin văn bản không hợp lệ hoặc vượt quá độ dài cho phép.');
  return value.trim() || null;
}
function status(value, values = ['active', 'inactive']) {
  if (!values.includes(value)) throw fail(400, 'Trạng thái không hợp lệ.');
  return value;
}
function handle(handler) {
  return async (req, res, next) => {
    try { await handler(req, res); }
    catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message });
      if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Phân công hoặc giờ bắt đầu ca đã tồn tại.' });
      if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ message: 'Nhân viên hoặc dịch vụ không tồn tại.' });
      if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) return res.status(409).json({ message: 'Dữ liệu đang được cập nhật. Vui lòng thử lại.' });
      next(error);
    }
  };
}
async function employee(connection, employeeId, lock = false) {
  const [rows] = await connection.execute('SELECT * FROM employees WHERE id=?' + (lock ? ' FOR UPDATE' : ''), [employeeId]);
  if (!rows.length) throw fail(404, 'Nhân viên không tồn tại.');
  return rows[0];
}

exports.list = handle(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM employees ORDER BY id DESC');
  res.json({ data: rows });
});
exports.detail = handle(async (req, res) => res.json({ data: await employee(pool, id(req.params.id)) }));
exports.save = handle(async (req, res) => {
  const employeeId = req.params.id ? id(req.params.id) : null;
  const old = employeeId ? await employee(pool, employeeId) : {};
  const body = req.body || {};
  const merged = { experience_years: 0, status: 'active', ...old, ...body };
  const name = text(merged.full_name, 100, true);
  const phone = text(merged.phone, 20, true);
  if (!/^\+?[0-9 ()-]{6,20}$/.test(phone)) throw fail(400, 'Số điện thoại không hợp lệ.');
  const email = text(merged.email, 255)?.toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Email không hợp lệ.');
  if (!/^\d{1,3}$/.test(String(merged.experience_years)) || Number(merged.experience_years) > 255) throw fail(400, 'Số năm kinh nghiệm phải là số nguyên từ 0 đến 255.');
  const values = [name, phone, email, text(merged.specialty, 255), Number(merged.experience_years), status(merged.status)];
  let resultId = employeeId;
  if (employeeId) await pool.execute('UPDATE employees SET full_name=?,phone=?,email=?,specialty=?,experience_years=?,status=? WHERE id=?', [...values, employeeId]);
  else {
    const [result] = await pool.execute('INSERT INTO employees (full_name,phone,email,specialty,experience_years,status) VALUES (?,?,?,?,?,?)', values);
    resultId = result.insertId;
  }
  res.status(employeeId ? 200 : 201).json({ data: await employee(pool, resultId) });
});

const assignmentSelect = `SELECT es.*, e.full_name AS employee_name, s.name AS service_name,
  s.status AS service_status FROM employee_services es JOIN employees e ON e.id=es.employee_id JOIN services s ON s.id=es.service_id`;
exports.listAssignments = handle(async (req, res) => {
  const employeeId = req.query.employee_id === undefined ? null : id(req.query.employee_id);
  if (employeeId) await employee(pool, employeeId);
  const [rows] = await pool.execute(assignmentSelect + (employeeId ? ' WHERE es.employee_id=?' : '') + ' ORDER BY es.employee_id, es.service_id', employeeId ? [employeeId] : []);
  res.json({ data: rows });
});
exports.createAssignment = handle(async (req, res) => {
  const body = req.body || {};
  const employeeId = id(body.employee_id), serviceId = id(body.service_id);
  await employee(pool, employeeId);
  const [services] = await pool.execute('SELECT id FROM services WHERE id=?', [serviceId]);
  if (!services.length) throw fail(404, 'Dịch vụ không tồn tại.');
  await pool.execute('INSERT INTO employee_services (employee_id,service_id,status) VALUES (?,?,?)', [employeeId, serviceId, status(body.status ?? 'active')]);
  const [rows] = await pool.execute(assignmentSelect + ' WHERE es.employee_id=? AND es.service_id=?', [employeeId, serviceId]);
  res.status(201).json({ data: rows[0] });
});
exports.updateAssignment = handle(async (req, res) => {
  const employeeId = id(req.params.employeeId), serviceId = id(req.params.serviceId);
  const value = status(req.body?.status);
  const [existing] = await pool.execute('SELECT employee_id FROM employee_services WHERE employee_id=? AND service_id=?', [employeeId, serviceId]);
  if (!existing.length) throw fail(404, 'Phân công không tồn tại.');
  await pool.execute('UPDATE employee_services SET status=? WHERE employee_id=? AND service_id=?', [value, employeeId, serviceId]);
  res.json({ data: { employee_id: employeeId, service_id: serviceId, status: value } });
});

const scheduleSelect = `SELECT sc.*, DATE_FORMAT(sc.work_date, '%Y-%m-%d') AS work_date,
  e.full_name AS employee_name FROM employee_schedules sc JOIN employees e ON e.id=sc.employee_id`;
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01') throw fail(400, 'Ngày làm việc không hợp lệ.');
  const parsed = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw fail(400, 'Ngày làm việc không hợp lệ.');
  return value;
}
function time(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)) throw fail(400, 'Giờ làm việc không hợp lệ.');
  return value.length === 5 ? value + ':00' : value;
}
exports.listSchedules = handle(async (req, res) => {
  const conditions = [], values = [];
  if (req.query.employee_id !== undefined) {
    const employeeId = id(req.query.employee_id);
    await employee(pool, employeeId);
    conditions.push('sc.employee_id=?'); values.push(employeeId);
  }
  if (req.query.work_date !== undefined) { conditions.push('sc.work_date=?'); values.push(date(req.query.work_date)); }
  const [rows] = await pool.execute(scheduleSelect + (conditions.length ? ' WHERE ' + conditions.join(' AND ') : '') + ' ORDER BY sc.work_date DESC, sc.start_time', values);
  res.json({ data: rows });
});
exports.saveSchedule = handle(async (req, res) => {
  const scheduleId = req.params.id ? id(req.params.id) : null;
  const body = req.body || {};
  let employeeId;
  if (scheduleId) {
    const [rows] = await pool.execute('SELECT employee_id FROM employee_schedules WHERE id=?', [scheduleId]);
    if (!rows.length) throw fail(404, 'Ca làm việc không tồn tại.');
    employeeId = rows[0].employee_id;
    if (body.employee_id !== undefined && id(body.employee_id) !== employeeId) throw fail(400, 'Không chuyển ca sang nhân viên khác. Hãy tạo ca riêng cho nhân viên đó.');
  } else employeeId = id(body.employee_id);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Khóa nhân viên để các yêu cầu thêm/sửa ca của cùng người được xử lý lần lượt.
    await employee(connection, employeeId, true);
    let old = {};
    if (scheduleId) {
      const [rows] = await connection.execute(scheduleSelect + ' WHERE sc.id=? FOR UPDATE', [scheduleId]);
      if (!rows.length) throw fail(404, 'Ca làm việc không tồn tại.');
      old = rows[0];
    }
    const data = { status: 'working', ...old, ...body };
    const workDate = date(data.work_date), start = time(data.start_time), end = time(data.end_time);
    if (start >= end) throw fail(400, 'Giờ bắt đầu phải nhỏ hơn giờ kết thúc; ca không qua ngày.');
    const value = status(data.status, ['working', 'off']);
    const note = text(data.note, 255);
    if (value === 'working') {
      const [overlaps] = await connection.execute(
        "SELECT id FROM employee_schedules WHERE employee_id=? AND work_date=? AND status='working' AND start_time < ? AND end_time > ? AND id <> ? FOR UPDATE",
        [employeeId, workDate, end, start, scheduleId || 0]
      );
      if (overlaps.length) throw fail(409, 'Ca làm việc chồng lấn với ca đang làm của nhân viên.');
    }
    let resultId = scheduleId;
    if (scheduleId) await connection.execute('UPDATE employee_schedules SET work_date=?,start_time=?,end_time=?,status=?,note=? WHERE id=?', [workDate, start, end, value, note, scheduleId]);
    else {
      const [result] = await connection.execute('INSERT INTO employee_schedules (employee_id,work_date,start_time,end_time,status,note) VALUES (?,?,?,?,?,?)', [employeeId, workDate, start, end, value, note]);
      resultId = result.insertId;
    }
    const [rows] = await connection.execute(scheduleSelect + ' WHERE sc.id=?', [resultId]);
    await connection.commit();
    res.status(scheduleId ? 200 : 201).json({ data: rows[0] });
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
});
