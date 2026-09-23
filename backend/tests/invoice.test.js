const request = require('supertest');
const { randomUUID } = require('node:crypto');
const app = require('../app');
const pool = require('../config/db');
const prefix = `INVTEST-${randomUUID().slice(0, 16)}-`;
const accounts = {}, emails = [];
let categoryId, serviceId, employeeId, appointmentId, promotionId;
const endpoint = '/api/admin/invoices';
const api = (method, url = endpoint, role = 'admin') => request(app)[method](url).auth(accounts[role].token, { type: 'bearer' });
const create = (overrides = {}) => api('post').send({ appointment_id: appointmentId, ...overrides });
async function guard() {
  const [[db]] = await pool.query('SELECT DATABASE() AS name');
  if (db.name !== 'spa_management_test') throw new Error('Unsafe invoice test database');
}
async function appointment(customerId = accounts.user.customerId, status = 'completed') {
  const [row] = await pool.execute(`INSERT INTO appointments (customer_id,employee_id,service_id,start_at,end_at,service_name_snapshot,booked_price,status)
    VALUES (?,?,?,'2020-01-01 09:00:00','2020-01-01 10:00:00',?,200000,?)`, [customerId,employeeId,serviceId,'Booking snapshot',status]);
  return row.insertId;
}
beforeAll(async () => {
  await guard();
  for (const role of ['user','other','admin']) {
    const email = prefix + role + '@example.com', password = 'InvoiceTest123!'; emails.push(email);
    const response = await request(app).post('/api/auth/register').send({ email,password,full_name:'Invoice '+role,phone:'0900000000' }).expect(201);
    if (role === 'admin') await pool.execute("UPDATE users SET role='admin' WHERE id=?", [response.body.data.user.id]);
    const login = await request(app).post('/api/auth/login').send({ email,password }).expect(200);
    accounts[role] = { token:login.body.data.token,customerId:response.body.data.customer.id };
  }
});
beforeEach(async () => {
  await guard();
  const [category] = await pool.execute('INSERT INTO service_categories (name) VALUES (?)', [prefix+'Category']); categoryId=category.insertId;
  const [service] = await pool.execute('INSERT INTO services (category_id,name,description,price,duration_minutes) VALUES (?,?,?,?,60)', [categoryId,prefix+'Current service','Test',999000]); serviceId=service.insertId;
  const [employee] = await pool.execute('INSERT INTO employees (full_name,phone) VALUES (?,?)', [prefix+'Employee','0900000000']); employeeId=employee.insertId;
  await pool.execute('INSERT INTO employee_services (employee_id,service_id) VALUES (?,?)', [employeeId,serviceId]);
  appointmentId=await appointment();
  const [promotion] = await pool.execute(`INSERT INTO promotions (code,name,discount_type,discount_value,minimum_amount,start_at,end_at)
    VALUES (?,?,'percentage',10,0,'2000-01-01 00:00:00','2099-01-01 00:00:00')`, [prefix+'PROMO','Invoice promotion']); promotionId=promotion.insertId;
});
afterEach(async () => {
  await guard();
  // Chỉ dọn dữ liệu thuộc danh mục/nhân viên UUID của suite theo thứ tự FK.
  await pool.execute('DELETE d FROM invoice_details d JOIN invoices i ON i.id=d.invoice_id JOIN appointments a ON a.id=i.appointment_id JOIN employees e ON e.id=a.employee_id WHERE e.full_name LIKE ?', [prefix+'%']);
  await pool.execute('DELETE i FROM invoices i JOIN appointments a ON a.id=i.appointment_id JOIN employees e ON e.id=a.employee_id WHERE e.full_name LIKE ?', [prefix+'%']);
  await pool.execute('DELETE a FROM appointments a JOIN employees e ON e.id=a.employee_id WHERE e.full_name LIKE ?', [prefix+'%']);
  await pool.execute('DELETE es FROM employee_services es JOIN employees e ON e.id=es.employee_id WHERE e.full_name LIKE ?', [prefix+'%']);
  await pool.execute('DELETE FROM employees WHERE full_name LIKE ?', [prefix+'%']);
  await pool.execute('DELETE s FROM services s JOIN service_categories c ON c.id=s.category_id WHERE c.name LIKE ?', [prefix+'%']);
  await pool.execute('DELETE FROM service_categories WHERE name LIKE ?', [prefix+'%']);
  await pool.execute('DELETE FROM promotions WHERE code LIKE ?', [prefix+'%']);
});
afterAll(async () => {
  try { await guard(); for(const email of emails) {
    await pool.execute('DELETE c FROM customers c JOIN users u ON u.id=c.user_id WHERE u.email=?', [email]);
    await pool.execute('DELETE FROM users WHERE email=?', [email]);
  } } finally { await pool.end(); }
});
describe('Invoice', () => {
  test('confirmed appointment is eligible and creates one invoice from booking snapshot', async () => {
    await pool.execute("UPDATE appointments SET status='confirmed' WHERE id=?", [appointmentId]);
    expect((await api('get',endpoint+'/eligible-appointments').expect(200)).body.data.map(r=>r.id)).toContain(appointmentId);
    const saved=(await create().expect(201)).body.data;
    expect(saved).toMatchObject({subtotal:'200000',total_amount:'200000',service_name_snapshot:'Booking snapshot',payment_status:'unpaid'});
    expect((await api('get',endpoint+'/eligible-appointments').expect(200)).body.data.map(r=>r.id)).not.toContain(appointmentId);
    await create().expect(409);
  });
  test.each(['user','admin'])('%s cannot cancel a paid confirmed appointment', async role => {
    await pool.execute("UPDATE appointments SET status='confirmed',start_at='2099-01-01 09:00:00',end_at='2099-01-01 10:00:00' WHERE id=?", [appointmentId]);
    const saved=(await create().expect(201)).body.data;
    await pool.execute("UPDATE invoices SET payment_status='paid',payment_method='bank_transfer',paid_at=NOW() WHERE id=?", [saved.id]);
    const url=role==='admin' ? `/api/admin/appointments/${appointmentId}/status` : `/api/appointments/${appointmentId}/cancel`;
    const response=await api('patch',url,role).send({status:'cancelled'}).expect(409);
    expect(response.body.message).toContain('Lịch hẹn đã thanh toán');
    const [[row]]=await pool.execute('SELECT status FROM appointments WHERE id=?',[appointmentId]);expect(row.status).toBe('confirmed');
  });
  test('user can cancel future confirmed appointment with unpaid invoice', async () => {
    await pool.execute("UPDATE appointments SET status='confirmed',start_at='2099-01-01 09:00:00',end_at='2099-01-01 10:00:00' WHERE id=?", [appointmentId]);
    await create().expect(201);
    await api('patch',`/api/appointments/${appointmentId}/cancel`,'user').send({}).expect(200);
    const [[row]]=await pool.execute('SELECT status FROM appointments WHERE id=?',[appointmentId]);expect(row.status).toBe('cancelled');
  });
  test('all invoice endpoints require authentication', async () => {
    for (const url of [endpoint,endpoint+'/1',endpoint+'/eligible-appointments','/api/invoices','/api/invoices/1']) await request(app).get(url).expect(401);
    await request(app).post(endpoint).send({appointment_id:appointmentId}).expect(401);
  });
  test('user cannot access admin list, detail, eligible appointments or create', async () => {
    for (const url of [endpoint,endpoint+'/1',endpoint+'/eligible-appointments']) await api('get',url,'user').expect(403);
    await api('post',endpoint,'user').send({appointment_id:appointmentId}).expect(403);
  });
  test('creates unpaid invoice and one detail from booking snapshots without promotion', async () => {
    const response = await create().expect(201), saved=response.body.data;
    expect(saved).toMatchObject({customer_id:accounts.user.customerId,appointment_id:appointmentId,promotion_id:null,subtotal:'200000',discount_amount:'0',total_amount:'200000',payment_status:'unpaid',payment_method:null,paid_at:null,service_name_snapshot:'Booking snapshot'});
    expect(saved.invoice_code).toMatch(/^INV-[A-F0-9]{24}$/);
    expect(saved.details).toHaveLength(1);
    expect(saved.details[0]).toMatchObject({invoice_id:saved.id,service_id:serviceId,service_name_snapshot:'Booking snapshot',quantity:1,unit_price:'200000',total_price:'200000'});
    const [[db]]=await pool.execute('SELECT subtotal,total_amount,payment_status FROM invoices WHERE id=?',[saved.id]);
    expect(db).toEqual({subtotal:'200000',total_amount:'200000',payment_status:'unpaid'});
  });
  test('applies percentage and saves promotion snapshots', async () => {
    const response=await create({promotion_id:promotionId}).expect(201);
    expect(response.body.data).toMatchObject({promotion_id:promotionId,promotion_code_snapshot:prefix+'PROMO',discount_type_snapshot:'percentage',discount_value_snapshot:'10.00',discount_amount:'20000',total_amount:'180000',promotion_applied_at:expect.any(String)});
  });
  test('applies fixed amount', async () => {
    await pool.execute("UPDATE promotions SET discount_type='fixed',discount_value=35000 WHERE id=?",[promotionId]);
    const response=await create({promotion_id:promotionId}).expect(201);
    expect(response.body.data).toMatchObject({discount_amount:'35000',total_amount:'165000'});
  });
  test('caps percentage at max_discount_amount', async () => {
    await pool.execute('UPDATE promotions SET max_discount_amount=12000 WHERE id=?',[promotionId]);
    const response=await create({promotion_id:promotionId}).expect(201);
    expect(response.body.data).toMatchObject({max_discount_snapshot:'12000',discount_amount:'12000',total_amount:'188000'});
  });
  test('caps fixed discount at subtotal and total is zero', async () => {
    await pool.execute("UPDATE promotions SET discount_type='fixed',discount_value=900000 WHERE id=?",[promotionId]);
    const response=await create({promotion_id:promotionId}).expect(201);
    expect(response.body.data).toMatchObject({discount_amount:'200000',total_amount:'0'});
  });
  test('100 percent discount results in zero total', async () => {
    await pool.execute('UPDATE promotions SET discount_value=100 WHERE id=?',[promotionId]);
    const response=await create({promotion_id:promotionId}).expect(201);
    expect(response.body.data.total_amount).toBe('0');
  });
  test('rounds percentage half up to whole VND', async () => {
    await pool.execute('UPDATE appointments SET booked_price=100005 WHERE id=?',[appointmentId]);
    const response=await create({promotion_id:promotionId}).expect(201);
    expect(response.body.data).toMatchObject({discount_amount:'10001',total_amount:'90004'});
  });
  test('percentage calculation remains exact near DECIMAL limit', async () => {
    await pool.execute('UPDATE appointments SET booked_price=999999999999 WHERE id=?',[appointmentId]);
    await pool.execute('UPDATE promotions SET discount_value=99.99 WHERE id=?',[promotionId]);
    const response=await create({promotion_id:promotionId}).expect(201);
    expect(response.body.data).toMatchObject({discount_amount:'999899999999',total_amount:'100000000'});
  });
  test('allows subtotal equal to minimum amount', async () => {
    await pool.execute('UPDATE promotions SET minimum_amount=200000 WHERE id=?',[promotionId]);
    await create({promotion_id:promotionId}).expect(201);
  });
  test('missing appointment is rejected', async () => { await create({appointment_id:4294967295}).expect(404); });
  test.each(['pending','cancelled'])('rejects %s appointment',async status=>{
    await pool.execute('UPDATE appointments SET status=?,cancelled_at=? WHERE id=?',[status,status === 'cancelled' ? '2019-12-31 09:00:00' : null,appointmentId]);
    await create().expect(409);
  });
  test('rejects duplicate invoice', async()=>{await create().expect(201);await create().expect(409);});
  test('missing promotion is rejected with no invoice persisted',async()=>{
    await create({promotion_id:4294967295}).expect(404);
    const [[row]]=await pool.execute('SELECT COUNT(*) total FROM invoices WHERE appointment_id=?',[appointmentId]);expect(row.total).toBe(0);
  });
  test.each([
    ['inactive',"status='inactive'"],['future',"start_at='2098-01-01 00:00:00'"],
    ['expired',"end_at='2001-01-01 00:00:00'"],['below minimum','minimum_amount=200001'],
  ])('rejects %s promotion and rolls back',async(label,update)=>{
    await pool.execute('UPDATE promotions SET '+update+' WHERE id=?',[promotionId]);
    await create({promotion_id:promotionId}).expect(400);
    const [[row]]=await pool.execute('SELECT COUNT(*) total FROM invoices WHERE appointment_id=?',[appointmentId]);expect(row.total).toBe(0);
  });
  test('rejects malformed IDs and client-supplied financial or payment fields',async()=>{
    await create({appointment_id:'abc'}).expect(400);
    await create({promotion_id:-1}).expect(400);
    await create({subtotal:1,total_amount:1,payment_status:'paid'}).expect(400);
  });
  test('eligible appointments exclude unfinished and already invoiced appointments',async()=>{
    const pending=await appointment(accounts.user.customerId,'pending');
    const cancelled=await appointment(accounts.user.customerId,'pending');
    await pool.execute("UPDATE appointments SET status='cancelled',cancelled_at=NOW() WHERE id=?",[cancelled]);
    const before=await api('get',endpoint+'/eligible-appointments').expect(200);
    expect(before.body.data.map(r=>r.id)).toContain(appointmentId);expect(before.body.data.map(r=>r.id)).not.toContain(pending);
    expect(before.body.data.map(r=>r.id)).not.toContain(cancelled);
    await create().expect(201);
    const after=await api('get',endpoint+'/eligible-appointments').expect(200);expect(after.body.data.map(r=>r.id)).not.toContain(appointmentId);
  });
  test('admin list, detail and payment/date filters work',async()=>{
    const saved=(await create().expect(201)).body.data;
    const response=await api('get',endpoint).query({payment_status:'unpaid',date:saved.created_at.slice(0,10)}).expect(200);
    expect(response.body.data.map(r=>r.id)).toContain(saved.id);
    expect((await api('get',endpoint).query({payment_status:'paid'}).expect(200)).body.data.map(r=>r.id)).not.toContain(saved.id);
    expect((await api('get',endpoint).query({date:'2000-01-01'}).expect(200)).body.data.map(r=>r.id)).not.toContain(saved.id);
    expect((await api('get',`${endpoint}/${saved.id}`).expect(200)).body.data.details).toHaveLength(1);
  });
  test('invalid filters and missing invoice are rejected',async()=>{
    await api('get',endpoint).query({payment_status:'refunded'}).expect(400);
    await api('get',endpoint).query({date:'2026-02-30'}).expect(400);
    await api('get',endpoint+'/4294967295').expect(404);
  });
  test('user sees only own list/detail and cannot access another invoice by id',async()=>{
    const own=(await create().expect(201)).body.data;
    const otherId=await appointment(accounts.other.customerId);
    const other=(await create({appointment_id:otherId}).expect(201)).body.data;
    const response=await api('get','/api/invoices','user').expect(200);
    expect(response.body.data.map(r=>r.id)).toContain(own.id);expect(response.body.data.map(r=>r.id)).not.toContain(other.id);
    await api('get',`/api/invoices/${own.id}`,'user').expect(200);
    await api('get',`/api/invoices/${other.id}`,'user').expect(404);
    await api('get','/api/invoices/4294967295','user').expect(404);
  });
  test('service and promotion edits do not change invoice snapshots',async()=>{
    const saved=(await create({promotion_id:promotionId}).expect(201)).body.data;
    await pool.execute('UPDATE services SET name=?,price=1 WHERE id=?',[prefix+'Changed',serviceId]);
    await pool.execute('UPDATE promotions SET code=?,discount_value=90 WHERE id=?',[prefix+'CHANGED',promotionId]);
    const detail=(await api('get',`${endpoint}/${saved.id}`).expect(200)).body.data;
    expect(detail).toMatchObject({service_name_snapshot:'Booking snapshot',subtotal:'200000',total_amount:'180000',promotion_code_snapshot:prefix+'PROMO',discount_value_snapshot:'10.00'});
    expect(detail.details[0]).toMatchObject({service_name_snapshot:'Booking snapshot',unit_price:'200000'});
  });
  test('concurrent creation persists exactly one invoice and one detail',async()=>{
    const responses=await Promise.all([create(),create()]);expect(responses.map(r=>r.status).sort()).toEqual([201,409]);
    const [[row]]=await pool.execute('SELECT COUNT(*) total FROM invoices WHERE appointment_id=?',[appointmentId]);expect(row.total).toBe(1);
    const [[details]]=await pool.execute('SELECT COUNT(*) total FROM invoice_details d JOIN invoices i ON i.id=d.invoice_id WHERE i.appointment_id=?',[appointmentId]);expect(details.total).toBe(1);
  });
});
