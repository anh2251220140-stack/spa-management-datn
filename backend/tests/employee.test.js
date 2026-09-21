const request = require('supertest');
const { randomUUID } = require('node:crypto');
const app = require('../app');
const pool = require('../config/db');

const prefix = `employee-test-${randomUUID()}-`;
const emails = [];
const employeeIds = [];
const categoryIds = [];
let adminToken, userToken, employeeId, otherEmployeeId, serviceId;
const employees = '/api/admin/employees';
const assignments = '/api/admin/employee-services';
const schedules = '/api/admin/employee-schedules';
const admin = (method, url) => request(app)[method](url).auth(adminToken, { type: 'bearer' });
const profile = () => ({ full_name: prefix + 'New', phone: '0900000000', email: 'employee@example.com', specialty: 'Skin care', experience_years: 2 });
const shift = (overrides = {}) => ({ employee_id: employeeId, work_date: '2026-10-10', start_time: '08:00', end_time: '12:00', ...overrides });
async function guard() {
  const [[db]] = await pool.query('SELECT DATABASE() AS name');
  if (db.name !== 'spa_management_test') throw new Error('Refusing to modify non-test database');
}
async function addShift(overrides = {}) {
  const response = await admin('post', schedules).send(shift(overrides)).expect(201);
  return response.body.data;
}
async function addAssignment(target = employeeId) {
  return admin('post', assignments).send({ employee_id: target, service_id: serviceId }).expect(201);
}
beforeAll(async () => {
  await guard();
  for (const role of ['admin', 'user']) {
    const email = prefix + role + '@example.com';
    emails.push(email);
    const password = 'EmployeeTest123!';
    const registered = await request(app).post('/api/auth/register').send({ email, password, full_name: 'Employee Test', phone: '0900000000' }).expect(201);
    if (role === 'admin') await pool.execute("UPDATE users SET role='admin' WHERE id=?", [registered.body.data.user.id]);
    const loggedIn = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
    if (role === 'admin') adminToken = loggedIn.body.data.token;
    else userToken = loggedIn.body.data.token;
  }
});
beforeEach(async () => {
  await guard();
  for (const name of ['A', 'B']) {
    const [row] = await pool.execute('INSERT INTO employees (full_name,phone) VALUES (?,?)', [prefix + name, '0900000000']);
    employeeIds.push(row.insertId);
  }
  [employeeId, otherEmployeeId] = employeeIds.slice(-2);
  const [category] = await pool.execute('INSERT INTO service_categories (name) VALUES (?)', [prefix + randomUUID()]);
  categoryIds.push(category.insertId);
  const [service] = await pool.execute('INSERT INTO services (category_id,name,description,price,duration_minutes) VALUES (?,?,?,?,?)', [category.insertId, prefix + 'Service', 'Test service', 100000, 30]);
  serviceId = service.insertId;
});
afterEach(async () => {
  await guard();
  // Chỉ dọn nhân viên của suite, kể cả bản ghi API tạo trước khi assertion thất bại.
  const [owned] = await pool.execute('SELECT id FROM employees WHERE full_name LIKE ?', [prefix + '%']);
  for (const row of owned) {
    await pool.execute('DELETE FROM employee_schedules WHERE employee_id=?', [row.id]);
    await pool.execute('DELETE FROM employee_services WHERE employee_id=?', [row.id]);
    await pool.execute('DELETE FROM employees WHERE id=?', [row.id]);
  }
  for (const categoryId of categoryIds) {
    await pool.execute('DELETE FROM services WHERE category_id=?', [categoryId]);
    await pool.execute('DELETE FROM service_categories WHERE id=?', [categoryId]);
  }
  employeeIds.length = 0; categoryIds.length = 0;
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

describe('Employee authorization', () => {
  test.each([employees, assignments, schedules])('missing token is rejected for %s', async url => {
    await request(app).get(url).expect(401);
    await request(app).post(url).send({}).expect(401);
  });
  test.each([employees, assignments, schedules])('regular user is rejected for %s', async url => {
    await request(app).get(url).auth(userToken, { type: 'bearer' }).expect(403);
    await request(app).post(url).auth(userToken, { type: 'bearer' }).send({}).expect(403);
  });
});
describe('Employee', () => {
  test('admin lists employees', async () => {
    const response = await admin('get', employees).expect(200);
    expect(response.body.data.map(row => row.id)).toEqual(expect.arrayContaining([employeeId, otherEmployeeId]));
  });
  test('admin reads employee detail', async () => {
    const response = await admin('get', `${employees}/${employeeId}`).expect(200);
    expect(response.body.data).toMatchObject({ id: employeeId, full_name: prefix + 'A' });
  });
  test('missing employee returns 404', async () => {
    await pool.execute('DELETE FROM employees WHERE id=?', [otherEmployeeId]);
    await admin('get', `${employees}/${otherEmployeeId}`).expect(404);
  });
  test('admin creates employee and persists profile', async () => {
    const response = await admin('post', employees).send(profile()).expect(201);
    const [[row]] = await pool.execute('SELECT * FROM employees WHERE id=?', [response.body.data.id]);
    expect(row).toMatchObject({ ...profile(), status: 'active' });
  });
  test.each([{ full_name: ' ' }, { email: 'bad-email' }, { phone: 'abc' }, { experience_years: -1 }])('invalid profile %j returns 400', async invalid => {
    await admin('post', employees).send({ ...profile(), ...invalid }).expect(400);
  });
  test('admin edits employee', async () => {
    await admin('patch', `${employees}/${employeeId}`).send({ full_name: prefix + 'Edited', specialty: 'Massage', experience_years: 5 }).expect(200);
    const response = await admin('get', `${employees}/${employeeId}`).expect(200);
    expect(response.body.data).toMatchObject({ full_name: prefix + 'Edited', specialty: 'Massage', experience_years: 5 });
  });
  test('admin disables and reactivates employee', async () => {
    for (const status of ['inactive', 'active']) {
      await admin('patch', `${employees}/${employeeId}`).send({ status }).expect(200);
      const [[row]] = await pool.execute('SELECT status FROM employees WHERE id=?', [employeeId]);
      expect(row.status).toBe(status);
    }
  });
});
describe('Employee Services', () => {
  test('admin lists assignments', async () => {
    await addAssignment(); await addAssignment(otherEmployeeId);
    const response = await admin('get', assignments).expect(200);
    expect(response.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ employee_id: employeeId, service_id: serviceId }),
      expect.objectContaining({ employee_id: otherEmployeeId, service_id: serviceId }),
    ]));
  });
  test('employee filter excludes other employees', async () => {
    await addAssignment(); await addAssignment(otherEmployeeId);
    const response = await admin('get', assignments).query({ employee_id: employeeId }).expect(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].employee_id).toBe(employeeId);
  });
  test('assignment persists correct composite key', async () => {
    await addAssignment();
    const [rows] = await pool.execute('SELECT * FROM employee_services WHERE employee_id=? AND service_id=?', [employeeId, serviceId]);
    expect(rows).toHaveLength(1); expect(rows[0].status).toBe('active');
  });
  test('missing employee returns 404', async () => {
    await pool.execute('DELETE FROM employees WHERE id=?', [otherEmployeeId]);
    await admin('post', assignments).send({ employee_id: otherEmployeeId, service_id: serviceId }).expect(404);
  });
  test('missing service returns 404', async () => {
    await pool.execute('DELETE FROM services WHERE id=?', [serviceId]);
    await admin('post', assignments).send({ employee_id: employeeId, service_id: serviceId }).expect(404);
  });
  test('duplicate assignment returns 409', async () => {
    await addAssignment();
    await admin('post', assignments).send({ employee_id: employeeId, service_id: serviceId }).expect(409);
    const [[row]] = await pool.execute('SELECT COUNT(*) AS total FROM employee_services WHERE employee_id=? AND service_id=?', [employeeId, serviceId]);
    expect(row.total).toBe(1);
  });
  test('assignment can be stopped and reactivated without deletion', async () => {
    await addAssignment();
    for (const status of ['inactive', 'active']) {
      await admin('patch', `${assignments}/${employeeId}/${serviceId}`).send({ status }).expect(200);
      const [[row]] = await pool.execute('SELECT status FROM employee_services WHERE employee_id=? AND service_id=?', [employeeId, serviceId]);
      expect(row.status).toBe(status);
    }
  });
});
describe('Employee Schedules', () => {
  test('admin lists schedules', async () => {
    const saved = await addShift();
    const response = await admin('get', schedules).expect(200);
    expect(response.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: saved.id })]));
  });
  test('filters schedules by employee', async () => {
    const saved = await addShift(); await addShift({ employee_id: otherEmployeeId });
    const response = await admin('get', schedules).query({ employee_id: employeeId }).expect(200);
    expect(response.body.data.map(row => row.id)).toEqual([saved.id]);
  });
  test('filters schedules by date', async () => {
    const saved = await addShift(); await addShift({ work_date: '2026-10-11' });
    const response = await admin('get', schedules).query({ work_date: '2026-10-10' }).expect(200);
    expect(response.body.data.every(row => row.work_date === '2026-10-10')).toBe(true);
    expect(response.body.data.map(row => row.id)).toContain(saved.id);
    expect(response.body.data.filter(row => row.employee_id === employeeId)).toHaveLength(1);
  });
  test('creates working shift', async () => {
    const saved = await addShift();
    expect(saved).toMatchObject({ employee_id: employeeId, work_date: '2026-10-10', start_time: '08:00:00', end_time: '12:00:00', status: 'working' });
    const [[row]] = await pool.execute('SELECT status FROM employee_schedules WHERE id=?', [saved.id]);
    expect(row.status).toBe('working');
  });
  test.each(['12:00', '13:00'])('start %s at or after end returns 400', async start => {
    await admin('post', schedules).send(shift({ start_time: start })).expect(400);
  });
  test('missing employee returns 404', async () => {
    await pool.execute('DELETE FROM employees WHERE id=?', [otherEmployeeId]);
    await admin('post', schedules).send(shift({ employee_id: otherEmployeeId })).expect(404);
  });
  test('overlapping working shift returns 409', async () => {
    await addShift();
    await admin('post', schedules).send(shift({ start_time: '10:00', end_time: '14:00' })).expect(409);
  });
  test('adjacent shifts are accepted', async () => {
    await addShift(); await addShift({ start_time: '12:00', end_time: '17:00' });
  });
  test('off shift may overlap working shift', async () => {
    await addShift();
    const saved = await addShift({ start_time: '09:00', end_time: '10:00', status: 'off' });
    expect(saved.status).toBe('off');
  });
  test('edits shift without conflicting with itself', async () => {
    const saved = await addShift();
    const response = await admin('patch', `${schedules}/${saved.id}`).send({ end_time: '11:30', note: 'Edited' }).expect(200);
    expect(response.body.data).toMatchObject({ id: saved.id, end_time: '11:30:00', note: 'Edited' });
  });
  test('off to working conflict returns 409 and rolls back', async () => {
    await addShift();
    const off = await addShift({ start_time: '09:00', end_time: '10:00', status: 'off' });
    await admin('patch', `${schedules}/${off.id}`).send({ status: 'working' }).expect(409);
    const [[row]] = await pool.execute('SELECT status FROM employee_schedules WHERE id=?', [off.id]);
    expect(row.status).toBe('off');
  });
  test('off to working at free time succeeds', async () => {
    await addShift();
    const off = await addShift({ start_time: '13:00', end_time: '17:00', status: 'off' });
    const response = await admin('patch', `${schedules}/${off.id}`).send({ status: 'working' }).expect(200);
    expect(response.body.data.status).toBe('working');
  });
  test('concurrent overlapping creates store exactly one shift', async () => {
    // Không giả định request nào thắng; đợi cả hai hoàn tất trước khi dọn dữ liệu.
    const results = await Promise.all([
      admin('post', schedules).send(shift()),
      admin('post', schedules).send(shift({ start_time: '09:00', end_time: '13:00' })),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    const [rows] = await pool.execute('SELECT id FROM employee_schedules WHERE employee_id=?', [employeeId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(results.find(result => result.status === 201).body.data.id);
  });
});
