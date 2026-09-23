jest.mock('../config/payos', () => ({ paymentRequests: { create: jest.fn(), get: jest.fn() }, webhooks: { verify: jest.fn() } }));
const request = require('supertest');
const { randomUUID } = require('node:crypto');
const app = require('../app');
const pool = require('../config/db');
const payos = require('../config/payos');
const prefix = `PAYTEST-${randomUUID().slice(0, 16)}-`;
const accounts = {}, emails = [];
let categoryId, serviceId, employeeId, invoiceId;
const api = (role = 'user', id = invoiceId) => request(app).post(`/api/invoices/${id}/payments`).auth(accounts[role].token, { type: 'bearer' });
async function guard() {
  const [[db]] = await pool.query('SELECT DATABASE() AS name');
  if (db.name !== 'spa_management_test') throw new Error('Unsafe payment test database');
}
async function savedPayments() { const [rows] = await pool.execute('SELECT * FROM payments WHERE invoice_id=? ORDER BY id', [invoiceId]); return rows; }
async function unchangedInvoice() {
  const [[row]] = await pool.execute('SELECT payment_status,paid_at,payment_method FROM invoices WHERE id=?', [invoiceId]);
  expect(row).toEqual({ payment_status: 'unpaid', paid_at: null, payment_method: null });
}
beforeAll(async () => {
  await guard();
  for (const role of ['user', 'other', 'admin']) {
    const email = prefix + role + '@example.com', password = 'PaymentTest123!'; emails.push(email);
    const response = await request(app).post('/api/auth/register').send({ email, password, full_name: 'Payment ' + role, phone: '0900000000' }).expect(201);
    if (role === 'admin') await pool.execute("UPDATE users SET role='admin' WHERE id=?", [response.body.data.user.id]);
    const login = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
    accounts[role] = { token: login.body.data.token, customerId: response.body.data.customer.id };
  }
});
beforeEach(async () => {
  await guard();
  payos.webhooks.verify.mockReset();
  payos.webhooks.verify.mockImplementation(async body => body.data);
  process.env.PAYOS_RETURN_URL = 'http://localhost:5173/payment/success';
  process.env.PAYOS_CANCEL_URL = 'http://localhost:5173/payment/cancel';
  payos.paymentRequests.create.mockReset(); payos.paymentRequests.get.mockReset();
  payos.paymentRequests.create.mockImplementation(async payload => ({ ...payload, status: 'PENDING', checkoutUrl: 'https://pay.payos.vn/web/0123456789abcdef0123456789abcdef', qrCode: 'TEST-VIETQR', paymentLinkId: '0123456789abcdef0123456789abcdef' }));
  payos.paymentRequests.get.mockImplementation(async orderCode => ({ orderCode, amount: 200000, amountPaid: 0, status: 'PENDING', id: '0123456789abcdef0123456789abcdef' }));
  const [category] = await pool.execute('INSERT INTO service_categories (name) VALUES (?)', [prefix + 'Category']); categoryId = category.insertId;
  const [service] = await pool.execute('INSERT INTO services (category_id,name,description,price,duration_minutes) VALUES (?,?,?,?,60)', [categoryId, prefix + 'Service', 'Test', 200000]); serviceId = service.insertId;
  const [employee] = await pool.execute('INSERT INTO employees (full_name,phone) VALUES (?,?)', [prefix + 'Employee', '0900000000']); employeeId = employee.insertId;
  await pool.execute('INSERT INTO employee_services (employee_id,service_id) VALUES (?,?)', [employeeId, serviceId]);
  const [appointment] = await pool.execute(`INSERT INTO appointments (customer_id,employee_id,service_id,start_at,end_at,service_name_snapshot,booked_price,status)
    VALUES (?,?,?,'2099-01-01 09:00:00','2099-01-01 10:00:00','Payment service',200000,'confirmed')`, [accounts.user.customerId, employeeId, serviceId]);
  const response = await request(app).post('/api/admin/invoices').auth(accounts.admin.token, { type: 'bearer' }).send({ appointment_id: appointment.insertId }).expect(201);
  invoiceId = response.body.data.id;
});
afterEach(async () => {
  await guard();
  // Chỉ dọn dữ liệu UUID của suite, theo đúng thứ tự khóa ngoại.
  for (const table of ['payments', 'invoice_details']) await pool.execute(`DELETE d FROM ${table} d JOIN invoices i ON i.id=d.invoice_id JOIN appointments a ON a.id=i.appointment_id JOIN employees e ON e.id=a.employee_id WHERE e.full_name LIKE ?`, [prefix + '%']);
  await pool.execute('DELETE i FROM invoices i JOIN appointments a ON a.id=i.appointment_id JOIN employees e ON e.id=a.employee_id WHERE e.full_name LIKE ?', [prefix + '%']);
  await pool.execute('DELETE a FROM appointments a JOIN employees e ON e.id=a.employee_id WHERE e.full_name LIKE ?', [prefix + '%']);
  await pool.execute('DELETE es FROM employee_services es JOIN employees e ON e.id=es.employee_id WHERE e.full_name LIKE ?', [prefix + '%']);
  await pool.execute('DELETE FROM employees WHERE full_name LIKE ?', [prefix + '%']);
  await pool.execute('DELETE s FROM services s JOIN service_categories c ON c.id=s.category_id WHERE c.name LIKE ?', [prefix + '%']);
  await pool.execute('DELETE FROM service_categories WHERE name LIKE ?', [prefix + '%']);
});
afterAll(async () => {
  try { await guard(); for (const email of emails) {
    await pool.execute('DELETE c FROM customers c JOIN users u ON u.id=c.user_id WHERE u.email=?', [email]);
    await pool.execute('DELETE FROM users WHERE email=?', [email]);
  } } finally { await pool.end(); }
});
describe('Payment', () => {
  test.each(['2026-01-01 09:59:59','2026-01-01 10:00:00'])('rejects ended appointment at %s without provider calls or new rows', async endAt => {
    await pool.execute('UPDATE appointments a JOIN invoices i ON i.appointment_id=a.id SET a.start_at=?,a.end_at=? WHERE i.id=?',['2026-01-01 09:00:00',endAt,invoiceId]);
    const clock=jest.spyOn(Date,'now').mockReturnValue(Date.parse('2026-01-01T10:00:00+07:00'));
    try {
      const response=await api().expect(409);
      expect(response.body.message).toBe('Lịch hẹn đã kết thúc. Vui lòng thanh toán trực tiếp tại Spa hoặc liên hệ Spa để được hỗ trợ.');
      expect(await savedPayments()).toHaveLength(0);
      expect(payos.paymentRequests.create).not.toHaveBeenCalled();expect(payos.paymentRequests.get).not.toHaveBeenCalled();
      await unchangedInvoice();
    } finally {clock.mockRestore();}
  });
  test('does not reuse old pending link after appointment ends or change history', async () => {
    await api().expect(201); const before=await savedPayments();
    await pool.execute("UPDATE appointments a JOIN invoices i ON i.appointment_id=a.id SET a.start_at='2020-01-01 09:00:00',a.end_at='2020-01-01 10:00:00' WHERE i.id=?",[invoiceId]);
    payos.paymentRequests.create.mockClear();payos.paymentRequests.get.mockClear();
    await api().expect(409);expect(await savedPayments()).toEqual(before);
    expect(payos.paymentRequests.create).not.toHaveBeenCalled();expect(payos.paymentRequests.get).not.toHaveBeenCalled();await unchangedInvoice();
  });
  test('confirmed appointment can be invoiced and prepaid without completing the service', async () => {
    const [[invoice]]=await pool.execute('SELECT appointment_id FROM invoices WHERE id=?',[invoiceId]);
    const appointmentId=invoice.appointment_id;
    await pool.execute('DELETE FROM invoice_details WHERE invoice_id=?',[invoiceId]);
    await pool.execute('DELETE FROM invoices WHERE id=?',[invoiceId]);
    await pool.execute("UPDATE appointments SET status='pending',start_at='2099-01-01 09:00:00',end_at='2099-01-01 10:00:00' WHERE id=?",[appointmentId]);
    const change=status=>request(app).patch(`/api/admin/appointments/${appointmentId}/status`).auth(accounts.admin.token,{type:'bearer'}).send({status});
    await change('confirmed').expect(200);
    const created=await request(app).post('/api/admin/invoices').auth(accounts.admin.token,{type:'bearer'}).send({appointment_id:appointmentId}).expect(201);
    invoiceId=created.body.data.id;
    const payment=(await api().expect(201)).body.payment;
    await request(app).post('/api/payments/payos/webhook').send({data:{orderCode:Number(payment.order_code),amount:200000,currency:'VND',code:'00',reference:prefix+'prepaid'}}).expect(200);
    const [[saved]]=await pool.execute('SELECT a.status,i.payment_status FROM appointments a JOIN invoices i ON i.appointment_id=a.id WHERE i.id=?',[invoiceId]);
    expect(saved).toEqual({status:'confirmed',payment_status:'paid'});
    await change('completed').expect(409);
    await pool.execute("UPDATE appointments SET start_at='2020-01-01 09:00:00',end_at='2020-01-01 10:00:00' WHERE id=?",[appointmentId]);
    await change('completed').expect(200);
  });
  test('no token returns 401', async () => { await request(app).post(`/api/invoices/${invoiceId}/payments`).expect(401); });
  test('another customer receives 404 without contacting payOS', async () => { await api('other').expect(404); expect(payos.paymentRequests.create).not.toHaveBeenCalled(); });
  test('admin cannot use customer payment endpoint', async () => { await api('admin').expect(403); });
  test('missing invoice returns 404', async () => { await api('user', 4294967295).expect(404); });
  test('invalid id returns 400', async () => { await api('user', 'abc').expect(400); });
  test('creates pending attempt with invoice amount, safe order code, URL and QR', async () => {
    const response = await api().expect(201), payment = response.body.payment;
    expect(payment).toMatchObject({ invoice_id: invoiceId, amount: '200000', status: 'pending', qr_code: 'TEST-VIETQR', checkout_url: expect.stringContaining('https://pay.payos.vn/') });
    expect(Number.isSafeInteger(Number(payment.order_code))).toBe(true);
    const [row] = await savedPayments();
    expect(row).toMatchObject({ provider: 'payos', payment_method: null, provider_transaction_id: null, paid_at: null, status: 'pending' });
    expect(payos.paymentRequests.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 200000, orderCode: Number(payment.order_code), returnUrl: process.env.PAYOS_RETURN_URL, cancelUrl: process.env.PAYOS_CANCEL_URL }), { timeout: 10000, maxRetries: 0 });
    expect(payos.paymentRequests.create.mock.calls[0][0].description.length).toBeLessThanOrEqual(9);
    await unchangedInvoice();
  });
  test('ignores forged financial, provider, status and redirect fields', async () => {
    const response = await api().send({ amount: 1, orderCode: 1, provider: 'fake', payment_status: 'paid', status: 'paid', returnUrl: 'https://evil.example' }).expect(201);
    expect(response.body.payment.amount).toBe('200000'); expect(Number(response.body.payment.order_code)).not.toBe(1);
    expect((await savedPayments())[0].provider).toBe('payos'); await unchangedInvoice();
  });
  test('paid invoice is rejected without creating payment', async () => {
    await pool.execute("UPDATE invoices SET payment_status='paid',payment_method='bank_transfer',paid_at=NOW() WHERE id=?", [invoiceId]);
    await api().expect(409); expect(await savedPayments()).toHaveLength(0); expect(payos.paymentRequests.create).not.toHaveBeenCalled();
  });
  test('zero amount is rejected', async () => { await pool.execute('UPDATE invoices SET subtotal=0,total_amount=0 WHERE id=?', [invoiceId]); await api().expect(400); expect(await savedPayments()).toHaveLength(0); });
  test('reuses pending payment without another create request', async () => {
    const first = await api().expect(201), second = await api().expect(200);
    expect(second.body.payment.id).toBe(first.body.payment.id); expect(await savedPayments()).toHaveLength(1); expect(payos.paymentRequests.create).toHaveBeenCalledTimes(1);
  });
  test.each(['failed', 'cancelled'])('new attempt after %s has a unique order code', async status => {
    const first = await api().expect(201);
    await pool.execute('UPDATE payments SET status=? WHERE id=?', [status, first.body.payment.id]);
    const second = await api().expect(201);
    expect(second.body.payment.order_code).not.toBe(first.body.payment.order_code); expect(await savedPayments()).toHaveLength(2); await unchangedInvoice();
  });
  test('provider error retains unresolved pending code without exposing SDK error or marking invoice paid', async () => {
    payos.paymentRequests.get.mockRejectedValueOnce(new Error('Provider unavailable'));
    payos.paymentRequests.create.mockRejectedValueOnce(new Error('FAKE_SENSITIVE_PROVIDER_VALUE'));
    const response = await api().expect(502);
    expect(JSON.stringify(response.body)).not.toContain('FAKE_SENSITIVE_PROVIDER_VALUE');
    expect(await savedPayments()).toHaveLength(1);
    expect((await savedPayments())[0]).toMatchObject({ status: 'pending', checkout_url: null, qr_code: null }); await unchangedInvoice();
  });
  test('retries unresolved attempt with same id and order code', async () => {
    payos.paymentRequests.get.mockRejectedValueOnce(new Error('Provider unavailable'));
    payos.paymentRequests.create.mockRejectedValueOnce(new Error('Timeout'));
    await api().expect(502); const [first] = await savedPayments();
    const response = await api().expect(200);
    expect(response.body.payment.id).toBe(first.id); expect(Number(response.body.payment.order_code)).toBe(Number(first.order_code)); expect(await savedPayments()).toHaveLength(1);
  });
  test('recovers existing remote link after ambiguous create error', async () => {
    payos.paymentRequests.create.mockImplementation(async payload => {
      payos.paymentRequests.get.mockResolvedValue({ id: '0123456789abcdef0123456789abcdef', orderCode: payload.orderCode, amount: payload.amount, status: 'PENDING' });
      throw new Error('Response lost');
    });
    const response = await api().expect(201);
    expect(response.body.payment.checkout_url).toContain('https://pay.payos.vn/web/'); expect(response.body.payment.qr_code).toBeNull(); await unchangedInvoice();
  });
  test('provider response with wrong amount is rejected', async () => {
    payos.paymentRequests.create.mockImplementation(async payload => ({ ...payload, amount: 1, status: 'PENDING', checkoutUrl: 'https://pay.payos.vn/web/test' }));
    await api().expect(502); expect((await savedPayments())[0].checkout_url).toBeNull(); await unchangedInvoice();
  });
  test('unsafe checkout URL is rejected', async () => {
    payos.paymentRequests.create.mockImplementation(async payload => ({ ...payload, status: 'PENDING', checkoutUrl: 'javascript:alert(1)' }));
    await api().expect(502); await unchangedInvoice();
  });
  test('invalid redirect configuration creates no attempt', async () => { process.env.PAYOS_RETURN_URL = 'javascript:alert(1)'; await api().expect(503); expect(await savedPayments()).toHaveLength(0); });
  test('concurrent clicks share one stored attempt and one provider create', async () => {
    const responses = await Promise.all([api(), api()]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 201]);
    expect(responses[0].body.payment.id).toBe(responses[1].body.payment.id);
    expect(await savedPayments()).toHaveLength(1); expect(payos.paymentRequests.create).toHaveBeenCalledTimes(1); await unchangedInvoice();
  });
  test('invoice list and detail remain unpaid after link creation', async () => {
    await api().expect(201);
    const detail = await request(app).get(`/api/invoices/${invoiceId}`).auth(accounts.user.token, { type: 'bearer' }).expect(200);
    expect(detail.body.data).toMatchObject({ payment_status: 'unpaid', paid_at: null, total_amount: '200000' });
  });
  test('replaces remotely cancelled link without cancelling any live provider link', async () => {
    const first = await api().expect(201);
    payos.paymentRequests.get.mockImplementationOnce(async orderCode => ({ orderCode, amount: 200000, amountPaid: 0, status: 'CANCELLED' }));
    const second = await api().expect(201);
    expect(second.body.payment.id).not.toBe(first.body.payment.id);
    expect((await savedPayments()).map(row => row.status)).toEqual(['cancelled', 'pending']); await unchangedInvoice();
  });
  test('remote paid status does not update invoice or create another payment', async () => {
    await api().expect(201);
    payos.paymentRequests.get.mockImplementationOnce(async orderCode => ({ orderCode, amount: 200000, amountPaid: 200000, status: 'PAID' }));
    await api().expect(409); expect(await savedPayments()).toHaveLength(1); await unchangedInvoice();
  });
});

describe('payOS webhook', () => {
  const endpoint = '/api/payments/payos/webhook';
  const send = data => request(app).post(endpoint).send({ code: '00', success: true, data, signature: 'mock-signature' });
  async function payload(overrides = {}) {
    const result = await api().expect(201);
    return { orderCode: Number(result.body.payment.order_code), amount: 200000, currency: 'VND', code: '00', reference: prefix + invoiceId, transactionDateTime: '2026-01-01 10:20:30', ...overrides };
  }
  async function state() {
    const [[invoice]] = await pool.execute("SELECT payment_status,payment_method,DATE_FORMAT(paid_at,'%Y-%m-%d %H:%i:%s') paid_at,subtotal,discount_amount,total_amount FROM invoices WHERE id=?", [invoiceId]);
    const [payments] = await pool.execute("SELECT id,status,payment_method,provider_transaction_id,DATE_FORMAT(paid_at,'%Y-%m-%d %H:%i:%s') paid_at FROM payments WHERE invoice_id=? ORDER BY id", [invoiceId]);
    return { invoice, payments };
  }
  test('verified success without JWT updates payment and invoice atomically', async () => {
    const data = await payload();
    expect((await send(data).expect(200)).body).toEqual({ code: '00', desc: 'success' });
    const saved = await state();
    expect(saved.invoice).toEqual({ payment_status: 'paid', payment_method: 'bank_transfer', paid_at: data.transactionDateTime, subtotal: '200000', discount_amount: '0', total_amount: '200000' });
    expect(saved.payments[0]).toMatchObject({ status: 'paid', payment_method: 'bank_transfer', provider_transaction_id: data.reference, paid_at: data.transactionDateTime });
    await api().expect(409);
  });
  test('invalid signature rejects without changes or sensitive response', async () => {
    const data = await payload(), before = await state();
    payos.webhooks.verify.mockRejectedValueOnce(new Error('FAKE_PRIVATE_KEY'));
    const response = await send(data).expect(400);
    expect(JSON.stringify(response.body)).not.toContain('FAKE_PRIVATE_KEY');
    expect(await state()).toEqual(before);
  });
  test('unknown verified order acknowledges without creating records', async () => {
    const data = await payload({ orderCode: Number.MAX_SAFE_INTEGER });
    const before = await state(); await send(data).expect(200); expect(await state()).toEqual(before);
    const [[row]] = await pool.execute('SELECT COUNT(*) total FROM payments WHERE order_code=?', [data.orderCode]); expect(row.total).toBe(0);
  });
  test('webhook amount mismatch is rejected', async () => {
    const data = await payload({ amount: 1 }), before = await state();
    await send(data).expect(400); expect(await state()).toEqual(before);
  });
  test('invoice amount mismatch is rejected', async () => {
    const data = await payload();
    await pool.execute('UPDATE invoices SET subtotal=100000,total_amount=100000 WHERE id=?', [invoiceId]);
    const before = await state(); await send(data).expect(400); expect(await state()).toEqual(before);
  });
  test('duplicate preserves paid_at and records even when timestamp changes', async () => {
    const data = await payload(); await send(data).expect(200); const before = await state();
    await send({ ...data, transactionDateTime: '2026-02-02 12:00:00' }).expect(200);
    expect(await state()).toEqual(before); expect(await savedPayments()).toHaveLength(1);
  });
  test('concurrent duplicate webhooks both acknowledge consistently', async () => {
    const data = await payload();
    const responses = await Promise.all([send(data), send(data)]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    const saved = await state(); expect(saved.payments).toHaveLength(1);
    expect(saved.payments[0].paid_at).toBe(saved.invoice.paid_at);
    expect(saved.invoice.payment_status).toBe('paid');
  });
  test.each(['cancelled', 'failed'])('late success accepts previously %s payment', async status => {
    const data = await payload(); await pool.execute('UPDATE payments SET status=? WHERE invoice_id=?', [status, invoiceId]);
    await send(data).expect(200); const saved = await state();
    expect(saved.payments[0].status).toBe('paid'); expect(saved.invoice.payment_status).toBe('paid');
  });
  test('only matching attempt changes; later success preserves first invoice paid_at', async () => {
    const first = await payload(); await pool.execute("UPDATE payments SET status='cancelled' WHERE invoice_id=?", [invoiceId]);
    const second = await payload({ reference: prefix + invoiceId + '-second', transactionDateTime: '2026-02-01 10:00:00' });
    await send(first).expect(200);
    expect((await state()).payments.map(p => p.status)).toEqual(['paid', 'pending']);
    await send(second).expect(200);
    const saved = await state(); expect(saved.payments.map(p => p.status)).toEqual(['paid', 'paid']);
    expect(saved.invoice.paid_at).toBe(first.transactionDateTime);
  });
  test('duplicate transaction reference cannot mark another attempt paid', async () => {
    const first = await payload(); await pool.execute("UPDATE payments SET status='cancelled' WHERE invoice_id=?", [invoiceId]);
    const second = await payload(); await send(first).expect(200); const before = await state();
    await send(second).expect(409); expect(await state()).toEqual(before);
  });
  test('non-success signed code never overwrites unpaid or paid state', async () => {
    const data = await payload(); const before = await state();
    await send({ ...data, code: '01' }).expect(200); expect(await state()).toEqual(before);
    await send(data).expect(200); const paid = await state();
    await send({ ...data, code: '01' }).expect(200); expect(await state()).toEqual(paid);
  });
  test('uses verified data rather than unsigned success envelope', async () => {
    const data = await payload();
    await request(app).post(endpoint).send({ code: '99', success: false, data, signature: 'mock-signature' }).expect(200);
    expect((await state()).invoice.payment_status).toBe('paid');
  });
  test.each([{ amount: -1 }, { amount: 1.5 }, { currency: 'USD' }, { orderCode: '123' }])('rejects invalid verified fields %j', async overrides => {
    const data = await payload(overrides), before = await state(); await send(data).expect(400); expect(await state()).toEqual(before);
  });
  test('invalid provider datetime falls back to server time consistently', async () => {
    const data = await payload({ transactionDateTime: '2026-02-30 10:00:00', reference: undefined });
    await send(data).expect(200); const saved = await state();
    expect(saved.payments[0].paid_at).toBe(saved.invoice.paid_at); expect(saved.invoice.paid_at).toMatch(/^\d{4}-\d{2}-\d{2} /);
    expect(saved.payments[0].provider_transaction_id).toBeNull(); await send(data).expect(200);
  });
  test('invoice update failure rolls back payment update; retry succeeds', async () => {
    const data = await payload(), before = await state();
    const connection = await pool.getConnection();
    const originalExecute = connection.execute.bind(connection);
    const executeSpy = jest.spyOn(connection, 'execute').mockImplementation((sql, values) => {
      if (sql.startsWith('UPDATE invoices')) return Promise.reject(new Error('SIMULATED_DB_FAILURE'));
      return originalExecute(sql, values);
    });
    const connectionSpy = jest.spyOn(pool, 'getConnection').mockResolvedValueOnce(connection);
    try { const response = await send(data).expect(500); expect(JSON.stringify(response.body)).not.toContain('SIMULATED_DB_FAILURE'); }
    finally { executeSpy.mockRestore(); connectionSpy.mockRestore(); }
    expect(await state()).toEqual(before);
    await send(data).expect(200); expect((await state()).invoice.payment_status).toBe('paid');
  });
  test('actual SDK locally verifies dummy-signed payload and rejects tampering without network', async () => {
    const { PayOS } = require('@payos/node');
    const local = new PayOS({ clientId: 'local-test', apiKey: 'local-test', checksumKey: 'local-test-checksum', logLevel: 'off' });
    const data = await payload();
    const signature = await local.crypto.createSignatureFromObj(data, 'local-test-checksum');
    payos.webhooks.verify.mockImplementation(body => local.webhooks.verify(body));
    const before = await state();
    await request(app).post(endpoint).send({ data: { ...data, amount: 1 }, signature }).expect(400); expect(await state()).toEqual(before);
    await request(app).post(endpoint).send({ code: '00', success: true, data, signature }).expect(200);
    await request(app).post(endpoint).send({ code: '00', success: true, data, signature }).expect(200);
    expect((await state()).invoice.payment_status).toBe('paid');
  });
});
