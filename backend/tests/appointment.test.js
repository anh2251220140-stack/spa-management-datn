const request = require('supertest');
const { randomUUID } = require('node:crypto');
const app = require('../app');
const pool = require('../config/db');

const prefix = `appointment-${randomUUID()}-`;
const accounts = {};
const emails = [];
let employeeId, otherEmployeeId, serviceId, categoryId, day;
const endpoint = '/api/appointments';
const adminEndpoint = '/api/admin/appointments';
const api = (method, url, who = 'user') => request(app)[method](url).auth(accounts[who].token, { type: 'bearer' });
const body = (overrides = {}) => ({ service_id: serviceId, employee_id: employeeId, date: day, start_time: '09:00', ...overrides });
async function guard() {
  const [[db]] = await pool.query('SELECT DATABASE() AS name');
  if (db.name !== 'spa_management_test') throw new Error('Unsafe database for Appointment tests');
}
async function book(overrides = {}, who = 'user') {
  const response = await api('post', endpoint, who).send(body(overrides)).expect(201);
  return response.body.data;
}
async function change(id, status) {
  return api('patch', `${adminEndpoint}/${id}/status`, 'admin').send({ status });
}
async function cancel(id, who = 'user') {
  return api('patch', `${endpoint}/${id}/cancel`, who).send({ cancel_reason: 'Test cancellation' });
}
async function stored(id) {
  const [[row]] = await pool.execute("SELECT *,DATE_FORMAT(start_at,'%Y-%m-%d %H:%i:%s') AS start_at,DATE_FORMAT(end_at,'%Y-%m-%d %H:%i:%s') AS end_at FROM appointments WHERE id=?", [id]);
  return row;
}
async function rejected(overrides, status, who = 'user') {
  await api('post', endpoint, who).send(body(overrides)).expect(status);
  const [[row]] = await pool.execute('SELECT COUNT(*) AS total FROM appointments WHERE service_id=?', [serviceId]);
  expect(row.total).toBe(0);
}
// Chỉ dùng dữ liệu quá khứ riêng khi kiểm tra hoàn thành/không cho hủy lịch đã bắt đầu.
async function pastAppointment(status = 'confirmed') {
  const saved = await book({ start_time: '16:00' });
  await pool.execute("UPDATE appointments SET start_at='2020-01-01 09:00:00',end_at='2020-01-01 10:00:00',status=? WHERE id=?", [status, saved.id]);
  return saved;
}

beforeAll(async () => {
  await guard();
  for (const role of ['user', 'other', 'admin']) {
    const email = prefix + role + '@example.com', password = 'AppointmentTest123!';
    emails.push(email);
    const registered = await request(app).post('/api/auth/register').send({ email, password, full_name: 'Appointment test', phone: '0900000000' }).expect(201);
    if (role === 'admin') await pool.execute("UPDATE users SET role='admin' WHERE id=?", [registered.body.data.user.id]);
    const login = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
    accounts[role] = { token: login.body.data.token, customerId: registered.body.data.customer.id };
  }
});
beforeEach(async () => {
  await guard();
  // Luôn ở tương lai, không phụ thuộc ngày chạy test hay timezone máy.
  day = new Date(Date.now() + 7 * 86400000 + 7 * 3600000).toISOString().slice(0, 10);
  const [category] = await pool.execute('INSERT INTO service_categories (name) VALUES (?)', [prefix + 'Category']);
  categoryId = category.insertId;
  const [service] = await pool.execute('INSERT INTO services (category_id,name,description,price,duration_minutes) VALUES (?,?,?,?,?)', [categoryId, prefix + 'Service', 'Test service', 150000, 60]);
  serviceId = service.insertId;
  const ids = [];
  for (const name of ['A', 'B']) {
    const [employee] = await pool.execute('INSERT INTO employees (full_name,phone) VALUES (?,?)', [prefix + name, '0900000000']);
    ids.push(employee.insertId);
    await pool.execute('INSERT INTO employee_services (employee_id,service_id) VALUES (?,?)', [employee.insertId, serviceId]);
    await pool.execute('INSERT INTO employee_schedules (employee_id,work_date,start_time,end_time) VALUES (?,?,?,?)', [employee.insertId, day, '08:00', '18:00']);
    await pool.execute("INSERT INTO employee_schedules (employee_id,work_date,start_time,end_time,status) VALUES (?,?,?,?,'off')", [employee.insertId, day, '12:15', '13:00']);
  }
  [employeeId, otherEmployeeId] = ids;
});
afterEach(async () => {
  await guard();
  // Dọn theo FK, chỉ nhân viên/danh mục mang UUID của suite này.
  const [owned] = await pool.execute('SELECT id FROM employees WHERE full_name LIKE ?', [prefix + '%']);
  for (const row of owned) {
    await pool.execute('DELETE FROM appointments WHERE employee_id=?', [row.id]);
    await pool.execute('DELETE FROM employee_schedules WHERE employee_id=?', [row.id]);
    await pool.execute('DELETE FROM employee_services WHERE employee_id=?', [row.id]);
    await pool.execute('DELETE FROM employees WHERE id=?', [row.id]);
  }
  await pool.execute('DELETE s FROM services s JOIN service_categories c ON c.id=s.category_id WHERE c.name LIKE ?', [prefix + '%']);
  await pool.execute('DELETE FROM service_categories WHERE name LIKE ?', [prefix + '%']);
});
afterAll(async () => {
  try {
    await guard();
    for (const email of emails) {
      await pool.execute('DELETE c FROM customers c JOIN users u ON u.id=c.user_id WHERE u.email=?', [email]);
      await pool.execute('DELETE FROM users WHERE email=?', [email]);
    }
  } finally { await pool.end(); }
});

describe('Appointment permission', () => {
  test('protected endpoints require token', async () => {
    await request(app).post(endpoint).send(body()).expect(401);
    await request(app).get(endpoint).expect(401);
    await request(app).get(`${endpoint}/1`).expect(401);
    await request(app).patch(`${endpoint}/1/cancel`).send({}).expect(401);
    await request(app).get(adminEndpoint).expect(401);
    await request(app).patch(`${adminEndpoint}/1/status`).send({ status: 'confirmed' }).expect(401);
  });
  test('user cannot access admin list, detail or status update', async () => {
    const saved = await book();
    await api('get', adminEndpoint).expect(403);
    await api('get', `${adminEndpoint}/${saved.id}`).expect(403);
    await api('patch', `${adminEndpoint}/${saved.id}/status`).send({ status: 'confirmed' }).expect(403);
    expect((await stored(saved.id)).status).toBe('pending');
  });
  test('other customer cannot read or cancel appointment', async () => {
    const saved = await book();
    await api('get', `${endpoint}/${saved.id}`, 'other').expect(404);
    expect((await cancel(saved.id, 'other')).status).toBe(404);
    expect((await stored(saved.id)).status).toBe('pending');
  });
});
describe('Create Appointment', () => {
  test('stores ownership, pending status, computed end and snapshots', async () => {
    const saved = await book({ customer_id: accounts.other.customerId, status: 'completed', end_at: day + ' 23:00:00', booked_price: 1 });
    expect(saved).toMatchObject({ customer_id: accounts.user.customerId, service_id: serviceId, employee_id: employeeId, status: 'pending', start_at: day + ' 09:00:00', end_at: day + ' 10:00:00', service_name_snapshot: prefix + 'Service', duration_minutes: 60 });
    const row = await stored(saved.id);
    expect(Number(row.booked_price)).toBe(150000);
    expect(row.customer_id).toBe(accounts.user.customerId);
    expect(row.end_at).toBe(day + ' 10:00:00');
  });
});
describe('Booking validation', () => {
  test('missing service is rejected', async () => {
    const [row] = await pool.execute('INSERT INTO services (category_id,name,description,price,duration_minutes) VALUES (?,?,?,?,?)', [categoryId, prefix + 'Deleted', 'Test', 1, 60]);
    await pool.execute('DELETE FROM services WHERE id=?', [row.insertId]);
    await rejected({ service_id: row.insertId }, 400);
  });
  test('inactive service is rejected', async () => {
    await pool.execute("UPDATE services SET status='inactive' WHERE id=?", [serviceId]); await rejected({}, 404);
  });
  test('inactive category is rejected', async () => {
    await pool.execute("UPDATE service_categories SET status='inactive' WHERE id=?", [categoryId]); await rejected({}, 404);
  });
  test('missing employee is rejected', async () => {
    const [row] = await pool.execute('INSERT INTO employees (full_name,phone) VALUES (?,?)', [prefix + 'Deleted', '0900000000']);
    await pool.execute('DELETE FROM employees WHERE id=?', [row.insertId]); await rejected({ employee_id: row.insertId }, 400);
  });
  test('inactive employee is rejected', async () => {
    await pool.execute("UPDATE employees SET status='inactive' WHERE id=?", [employeeId]); await rejected({}, 400);
  });
  test('unassigned employee is rejected', async () => {
    await pool.execute('DELETE FROM employee_services WHERE employee_id=? AND service_id=?', [employeeId, serviceId]); await rejected({}, 400);
  });
  test('inactive assignment is rejected', async () => {
    await pool.execute("UPDATE employee_services SET status='inactive' WHERE employee_id=? AND service_id=?", [employeeId, serviceId]); await rejected({}, 400);
  });
  test('no working schedule is rejected', async () => {
    await pool.execute('DELETE FROM employee_schedules WHERE employee_id=?', [employeeId]); await rejected({}, 409);
  });
  test('off interval is rejected', async () => { await rejected({ start_time: '12:00' }, 409); });
  test('before working hours is rejected', async () => { await rejected({ start_time: '07:00' }, 409); });
  test('end beyond working hours is rejected', async () => { await rejected({ start_time: '17:30' }, 409); });
});
describe('Overlap', () => {
  test('same employee cannot serve overlapping appointments for two customers', async () => {
    await book(); await api('post', endpoint, 'other').send(body({ start_time: '09:30' })).expect(409);
  });
  test('same customer cannot book overlapping appointments with different employees', async () => {
    await book(); await api('post', endpoint).send(body({ employee_id: otherEmployeeId, start_time: '09:30' })).expect(409);
  });
  test('consecutive appointments are accepted', async () => {
    const first = await book(), second = await book({ start_time: '10:00' });
    expect(first.end_at).toBe(second.start_at);
  });
  test('cancelled appointment releases slot for another customer', async () => {
    const first = await book(); expect((await cancel(first.id)).status).toBe(200);
    const second = await book({}, 'other'); expect(second.id).not.toBe(first.id);
  });
});
describe('User list and detail', () => {
  test('list includes own appointments only', async () => {
    const own = await book(); await book({ start_time: '10:00' }, 'other');
    const response = await api('get', endpoint).expect(200);
    expect(response.body.data.map(row => row.id)).toEqual([own.id]);
    expect(response.body.data[0].customer_id).toBe(accounts.user.customerId);
  });
  test('customer reads own detail', async () => {
    const saved = await book(); const response = await api('get', `${endpoint}/${saved.id}`).expect(200);
    expect(response.body.data).toMatchObject({ id: saved.id, customer_id: accounts.user.customerId });
  });
  test('missing appointment returns 404', async () => {
    const saved = await book(); await pool.execute('DELETE FROM appointments WHERE id=?', [saved.id]);
    await api('get', `${endpoint}/${saved.id}`).expect(404);
  });
});
describe('User cancel', () => {
  test.each(['pending', 'confirmed'])('customer cancels future %s appointment', async status => {
    const saved = await book(); if (status === 'confirmed') expect((await change(saved.id, status)).status).toBe(200);
    expect((await cancel(saved.id)).status).toBe(200);
    const row = await stored(saved.id); expect(row.status).toBe('cancelled'); expect(row.cancelled_at).not.toBeNull(); expect(row.cancel_reason).toBe('Test cancellation');
    await book();
  });
  test('completed appointment cannot be cancelled', async () => {
    const saved = await pastAppointment('completed'); expect((await cancel(saved.id)).status).toBe(409); expect((await stored(saved.id)).status).toBe('completed');
  });
  test('cancelled appointment cannot be cancelled again', async () => {
    const saved = await book(); expect((await cancel(saved.id)).status).toBe(200); expect((await cancel(saved.id)).status).toBe(409);
  });
  test('started appointment cannot be cancelled', async () => {
    const saved = await pastAppointment(); expect((await cancel(saved.id)).status).toBe(409); expect((await stored(saved.id)).status).toBe('confirmed');
  });
});
describe('Admin', () => {
  test('lists both customers and reads detail', async () => {
    const first = await book(), second = await book({ start_time: '10:00' }, 'other');
    const response = await api('get', adminEndpoint, 'admin').expect(200);
    expect(response.body.data.map(row => row.id)).toEqual(expect.arrayContaining([first.id, second.id]));
    const detail = await api('get', `${adminEndpoint}/${second.id}`, 'admin').expect(200);
    expect(detail.body.data.customer_id).toBe(accounts.other.customerId);
  });
  test('filters by status and date', async () => {
    const saved = await book(); expect((await change(saved.id, 'confirmed')).status).toBe(200);
    await book({ start_time: '10:00' }); await pastAppointment();
    const response = await api('get', adminEndpoint, 'admin').query({ date: day, status: 'confirmed' }).expect(200);
    expect(response.body.data.map(row => row.id)).toContain(saved.id);
    expect(response.body.data.every(row => row.status === 'confirmed' && row.start_at.startsWith(day))).toBe(true);
    expect(response.body.data.filter(row => row.customer_id === accounts.user.customerId)).toHaveLength(1);
  });
  test.each([['pending', 'confirmed'], ['pending', 'cancelled'], ['confirmed', 'cancelled']])('%s to %s succeeds', async (from, target) => {
    const saved = await book(); if (from === 'confirmed') expect((await change(saved.id, from)).status).toBe(200);
    const response = await change(saved.id, target); expect(response.status).toBe(200); expect((await stored(saved.id)).status).toBe(target);
  });
  test('confirmed to completed after end succeeds', async () => {
    const saved = await pastAppointment(); expect((await change(saved.id, 'completed')).status).toBe(200); expect((await stored(saved.id)).status).toBe('completed');
  });
});
describe('Invalid transitions', () => {
  test('cannot complete before end', async () => {
    const saved = await book(); expect((await change(saved.id, 'confirmed')).status).toBe(200);
    expect((await change(saved.id, 'completed')).status).toBe(409); expect((await stored(saved.id)).status).toBe('confirmed');
  });
  test('cancelled cannot return to confirmed', async () => {
    const saved = await book(); expect((await cancel(saved.id)).status).toBe(200);
    expect((await change(saved.id, 'confirmed')).status).toBe(409); expect((await stored(saved.id)).status).toBe('cancelled');
  });
  test.each(['confirmed', 'cancelled'])('completed cannot become %s', async target => {
    const saved = await pastAppointment('completed'); expect((await change(saved.id, target)).status).toBe(409); expect((await stored(saved.id)).status).toBe('completed');
  });
});
describe('Snapshot', () => {
  test('service changes do not change old appointment snapshots', async () => {
    const saved = await book();
    await pool.execute('UPDATE services SET name=?,price=?,duration_minutes=? WHERE id=?', [prefix + 'Renamed', 999000, 90, serviceId]);
    const response = await api('get', `${endpoint}/${saved.id}`).expect(200);
    expect(response.body.data.service_name_snapshot).toBe(prefix + 'Service');
    expect(Number(response.body.data.booked_price)).toBe(150000);
    expect(response.body.data.end_at).toBe(day + ' 10:00:00');
    const row = await stored(saved.id); expect(row.service_name_snapshot).toBe(prefix + 'Service'); expect(Number(row.booked_price)).toBe(150000);
  });
});
describe('Concurrency', () => {
  test.each(['employee', 'customer'])('concurrent overlapping requests for same %s store one record', async shared => {
    // Đợi cả hai request; không giả định thứ tự request thắng, không dùng sleep/fake timer.
    const results = await Promise.allSettled([
      api('post', endpoint).send(body()),
      api('post', endpoint, shared === 'employee' ? 'other' : 'user').send(body({ employee_id: shared === 'employee' ? employeeId : otherEmployeeId, start_time: '09:30' })),
    ]);
    expect(results.every(result => result.status === 'fulfilled')).toBe(true);
    const responses = results.map(result => result.value);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    const [rows] = await pool.execute('SELECT id,customer_id,employee_id FROM appointments WHERE service_id=?', [serviceId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(responses.find(response => response.status === 201).body.data.id);
    if (shared === 'customer') expect(rows[0].customer_id).toBe(accounts.user.customerId);
    else expect(rows[0].employee_id).toBe(employeeId);
  });
});
