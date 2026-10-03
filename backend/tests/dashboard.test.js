const request = require('supertest');
const { randomUUID } = require('node:crypto');
const app = require('../app');
const pool = require('../config/db');
const prefix = `DASHTEST-${randomUUID().slice(0, 12)}-`;
const accounts = {}, emails = [];
const endpoint = '/api/admin/dashboard';
let categoryId, serviceId, employeeId, baseline;
const get = (role = 'admin') => request(app).get(endpoint).auth(accounts[role].token, { type: 'bearer' });
const data = async () => (await get().expect(200)).body.data;
async function guard() {
  const [[row]] = await pool.query('SELECT DATABASE() name');
  if (row.name !== 'spa_management_test') throw new Error('Unsafe dashboard test database');
}
async function appointment(status = 'completed', start = '2026-02-01 09:00:00', service = serviceId, created = '2090-01-01 00:00:00') {
  const end = start.slice(0,10) + ' 23:59:59';
  const [row] = await pool.execute(`INSERT INTO appointments (customer_id,employee_id,service_id,start_at,end_at,service_name_snapshot,booked_price,status,cancelled_at,created_at)
    VALUES (?,?,?,?,?,'Dashboard snapshot',100000,?,?,?)`,[accounts.user.customerId,employeeId,service,start,end,status,status==='cancelled'?start:null,created]);
  return row.insertId;
}
async function invoice(paid = true, paidAt = '2026-02-01 00:00:00', amount = 100000) {
  const appt = await appointment();
  const [row] = await pool.execute(`INSERT INTO invoices (invoice_code,appointment_id,subtotal,total_amount,payment_status,payment_method,paid_at,created_at)
    VALUES (?,?,?,?,?,?,?,'2020-01-01 00:00:00')`,[prefix+appt,appt,amount,amount,paid?'paid':'unpaid',paid?'cash':null,paid?paidAt:null]);
  return row.insertId;
}
beforeAll(async () => {
  await guard();
  for (const role of ['user','admin']) {
    const email=prefix+role+'@example.com', password='DashboardTest123!'; emails.push(email);
    const response=await request(app).post('/api/auth/register').send({email,password,full_name:prefix+role,phone:'0900000000'}).expect(201);
    if(role==='admin') await pool.execute("UPDATE users SET role='admin' WHERE id=?",[response.body.data.user.id]);
    const login=await request(app).post('/api/auth/login').send({email,password}).expect(200);
    accounts[role]={token:login.body.data.token,customerId:response.body.data.customer.id};
  }
});
beforeEach(async () => {
  await guard();
  // 17:30 UTC ngày 31/01 là 00:30 ngày 01/02 tại Việt Nam.
  jest.spyOn(Date,'now').mockReturnValue(Date.parse('2026-01-31T17:30:00Z'));
  const [category]=await pool.execute('INSERT INTO service_categories (name) VALUES (?)',[prefix+'Category']); categoryId=category.insertId;
  const [service]=await pool.execute('INSERT INTO services (category_id,name,description,price,duration_minutes) VALUES (?,?,?,?,60)',[categoryId,prefix+'Service','Test',100000]); serviceId=service.insertId;
  const [employee]=await pool.execute('INSERT INTO employees (full_name,phone) VALUES (?,?)',[prefix+'Employee','0900000000']); employeeId=employee.insertId;
  await pool.execute('INSERT INTO employee_services (employee_id,service_id) VALUES (?,?)',[employeeId,serviceId]);
  baseline=await data();
});
afterEach(async () => {
  jest.restoreAllMocks(); await guard();
  for(const table of ['payments','invoice_details']) await pool.execute(`DELETE d FROM ${table} d JOIN invoices i ON i.id=d.invoice_id JOIN appointments a ON a.id=i.appointment_id WHERE a.employee_id=?`,[employeeId]);
  await pool.execute('DELETE i FROM invoices i JOIN appointments a ON a.id=i.appointment_id WHERE a.employee_id=?',[employeeId]);
  await pool.execute('DELETE FROM appointments WHERE employee_id=?',[employeeId]);
  await pool.execute('DELETE FROM employee_services WHERE employee_id=?',[employeeId]);
  await pool.execute('DELETE FROM employees WHERE id=?',[employeeId]);
  await pool.execute('DELETE FROM services WHERE category_id=?',[categoryId]);
  await pool.execute('DELETE FROM service_categories WHERE id=?',[categoryId]);
  await pool.execute('DELETE FROM customers WHERE user_id IS NULL AND full_name LIKE ?',[prefix+'%']);
});
afterAll(async () => {
  try { await guard(); for(const email of emails) {
    await pool.execute('DELETE c FROM customers c JOIN users u ON u.id=c.user_id WHERE u.email=?',[email]);
    await pool.execute('DELETE FROM users WHERE email=?',[email]);
  } } finally { await pool.end(); }
});
describe('Dashboard', () => {
  test('requires token', async () => { await request(app).get(endpoint).expect(401); });
  test('denies user', async () => { await get('user').expect(403); });
  test('admin receives all sections and Vietnam time', async () => {
    expect(baseline).toMatchObject({timezone:'Asia/Ho_Chi_Minh',generated_at:'2026-02-01 00:30:00'});
    expect(Object.keys(baseline.summary)).toHaveLength(5);
    expect(baseline.monthly_revenue.map(row=>row.month)).toEqual(['2025-09','2025-10','2025-11','2025-12','2026-01','2026-02']);
  });
  test('empty query results return zeros and six months without deleting existing data', async () => {
    // Chỉ mô phỏng kết quả rỗng; các test còn lại chạy SQL thật trên database test.
    const connection={query:jest.fn().mockResolvedValue([]),execute:jest.fn(),commit:jest.fn(),rollback:jest.fn(),release:jest.fn()};
    for(const rows of [[],[{count:0}],[{count:0}],[{paid_revenue:'0',unpaid_invoices:0}],[],[],[]]) connection.execute.mockResolvedValueOnce([rows]);
    jest.spyOn(pool,'getConnection').mockResolvedValueOnce(connection);
    const result=await data();
    expect(Object.values(result.summary)).toEqual([0,0,0,'0',0]);
    expect(Object.values(result.appointment_status)).toEqual([0,0,0,0]);
    expect(result.monthly_revenue).toHaveLength(6); expect(result.monthly_revenue.every(row=>row.revenue==='0')).toBe(true);
    expect(result.top_services).toEqual([]); expect(result.recent_appointments).toEqual([]);
  });
  test('all statuses sum to total, including cancelled', async () => {
    for(const status of ['pending','confirmed','completed','cancelled']) await appointment(status);
    const result=await data();
    expect(result.summary.total_appointments).toBe(baseline.summary.total_appointments+4);
    for(const status of Object.keys(result.appointment_status)) expect(result.appointment_status[status]).toBe(baseline.appointment_status[status]+1);
    expect(Object.values(result.appointment_status).reduce((a,b)=>a+b,0)).toBe(result.summary.total_appointments);
  });
  test('today uses Vietnam start_at boundaries, not created_at', async () => {
    for(const start of ['2026-01-31 23:59:58','2026-02-01 00:00:00','2026-02-01 23:59:58','2026-02-02 00:00:00']) await appointment('pending',start);
    expect((await data()).summary.today_appointments).toBe(baseline.summary.today_appointments+2);
  });
  test('today counts pending confirmed completed but not cancelled', async () => {
    for(const status of ['pending','confirmed','completed','cancelled']) await appointment(status);
    expect((await data()).summary.today_appointments).toBe(baseline.summary.today_appointments+3);
  });
  test('admin profile is excluded from customer total', async () => {
    await pool.execute("UPDATE users u JOIN customers c ON c.user_id=u.id SET u.role='user' WHERE c.id=?",[accounts.admin.customerId]);
    try {
      const result=await require('../services/dashboardService').getDashboard();
      expect(result.summary.total_customers).toBe(baseline.summary.total_customers+1);
    } finally { await pool.execute("UPDATE users u JOIN customers c ON c.user_id=u.id SET u.role='admin' WHERE c.id=?",[accounts.admin.customerId]); }
  });
  test('counts inactive customers and customers without accounts', async () => {
    await pool.execute("INSERT INTO customers (full_name,phone,status) VALUES (?,?,'inactive')",[prefix+'Walk-in','0900000000']);
    expect((await data()).summary.total_customers).toBe(baseline.summary.total_customers+1);
  });
  test('paid revenue and unpaid count come from invoice status', async () => {
    await invoice(true,'2026-02-01 00:00:00',80000); await invoice(false,null,90000);
    const result=await data();
    expect(BigInt(result.summary.paid_revenue)-BigInt(baseline.summary.paid_revenue)).toBe(80000n);
    expect(result.summary.unpaid_invoices).toBe(baseline.summary.unpaid_invoices+1);
  });
  test('multiple paid and failed payment attempts do not duplicate revenue', async () => {
    const id=await invoice();
    for(const [index,status] of ['paid','paid','failed'].entries()) await pool.execute(`INSERT INTO payments (invoice_id,order_code,amount,status,payment_method,paid_at) VALUES (?,?,?,?,?,?)`,[id,Date.parse('2026-01-01')+id*10+index,100000,status,status==='paid'?'bank_transfer':null,status==='paid'?'2026-02-01 00:00:00':null]);
    expect(BigInt((await data()).summary.paid_revenue)-BigInt(baseline.summary.paid_revenue)).toBe(100000n);
  });
  test('multiple invoice details do not multiply revenue', async () => {
    const id=await invoice();
    for(let i=0;i<2;i++) await pool.execute('INSERT INTO invoice_details (invoice_id,service_id,service_name_snapshot,quantity,unit_price) VALUES (?,?,?,1,50000)',[id,serviceId,'Snapshot']);
    expect(BigInt((await data()).summary.paid_revenue)-BigInt(baseline.summary.paid_revenue)).toBe(100000n);
  });
  test('monthly revenue uses paid_at and excludes unpaid invoices', async () => {
    await invoice(true,'2026-01-31 23:59:59',12345); await invoice(true,'2026-02-01 00:00:00',54321); await invoice(false);
    const result=await data();
    for(const [month,amount] of [['2026-01',12345n],['2026-02',54321n]]) expect(BigInt(result.monthly_revenue.find(r=>r.month===month).revenue)-BigInt(baseline.monthly_revenue.find(r=>r.month===month).revenue)).toBe(amount);
  });
  test('six-month window includes first boundary, excludes older and future payments', async () => {
    await invoice(true,'2025-08-31 23:59:59'); await invoice(true,'2025-09-01 00:00:00',50000); await invoice(true,'2026-03-01 00:00:00');
    const result=await data();
    expect(BigInt(result.monthly_revenue[0].revenue)-BigInt(baseline.monthly_revenue[0].revenue)).toBe(50000n);
    expect(result.monthly_revenue.slice(1)).toEqual(baseline.monthly_revenue.slice(1));
  });
  test('top services only count completed, keep inactive services and use current names', async () => {
    const count=Math.max(8,...baseline.top_services.map(row=>row.usage_count+1));
    for(let i=0;i<count;i++) await appointment('completed');
    await appointment('pending'); await appointment('cancelled');
    await pool.execute("UPDATE services SET status='inactive',name=? WHERE id=?",[prefix+'Renamed',serviceId]);
    await pool.execute("UPDATE service_categories SET status='inactive' WHERE id=?",[categoryId]);
    const row=(await data()).top_services.find(r=>r.service_id===serviceId);
    expect(row).toEqual({service_id:serviceId,service_name:prefix+'Renamed',usage_count:count});
  });
  test('top services limited to five and tie broken by service ID', async () => {
    const ids=[];
    for(let i=0;i<6;i++) {
      const [s]=await pool.execute('INSERT INTO services (category_id,name,description,price,duration_minutes) VALUES (?,?,?,?,60)',[categoryId,prefix+i,'Test',100000]);
      ids.push(s.insertId); await pool.execute('INSERT INTO employee_services (employee_id,service_id) VALUES (?,?)',[employeeId,s.insertId]);
      for(let j=0;j<10;j++) await appointment('completed','2026-02-01 09:00:00',s.insertId);
    }
    const result=(await data()).top_services;
    const expected=[...baseline.top_services,...ids.map(id=>({service_id:id,service_name:prefix+ids.indexOf(id),usage_count:10}))].sort((a,b)=>b.usage_count-a.usage_count||a.service_id-b.service_id).slice(0,5);
    expect(result).toEqual(expected);
  });
  test('recent uses creation date then ID, limit five, not appointment start', async () => {
    const ids=[];
    for(let i=0;i<6;i++) ids.push(await appointment('pending',`2026-02-0${6-i} 09:00:00`));
    await pool.execute("UPDATE appointments SET created_at='2091-01-01 00:00:00' WHERE id=?",[ids[0]]);
    const rows=(await data()).recent_appointments;
    expect(rows.map(row=>row.id)).toEqual([ids[0],ids[5],ids[4],ids[3],ids[2]]);
  });
  test('recent response only includes necessary display fields', async () => {
    await appointment(); const row=(await data()).recent_appointments[0];
    expect(Object.keys(row).sort()).toEqual(['id','customer_name','service_name_snapshot','employee_name','start_at','end_at','status','created_at'].sort());
    expect(row.service_name_snapshot).toBe('Dashboard snapshot');
  });
});
