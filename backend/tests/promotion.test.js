const { randomUUID } = require('node:crypto');
const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');
const prefix = `PROMO-${randomUUID().slice(0, 18)}-`.toUpperCase();
const emails = [];
let adminToken, userToken, promotionId;
const endpoint = '/api/admin/promotions';
const admin = (method, url = endpoint) => request(app)[method](url).auth(adminToken, { type: 'bearer' });
const body = (overrides = {}) => ({ code: prefix + 'NEW', name: 'Promotion Test', description: 'Test description', discount_type: 'percentage', discount_value: 15.5, minimum_amount: 100000, max_discount_amount: 50000, start_at: '2020-01-01 08:00:00', end_at: '2099-12-31 23:59:59', status: 'active', ...overrides });
async function assertTestDatabase() {
  const [[database]] = await pool.query('SELECT DATABASE() AS name');
  if (database.name !== 'spa_management_test') throw new Error('Unsafe test database');
}
beforeAll(async () => {
  await assertTestDatabase();
  for (const role of ['admin', 'user']) {
    const email = `${prefix}${role}@example.com`;
    emails.push(email);
    const password = 'PromotionTest123!';
    const response = await request(app).post('/api/auth/register').send({ email, password, full_name: 'Promotion Test', phone: '0900000000' }).expect(201);
    if (role === 'admin') await pool.execute("UPDATE users SET role='admin' WHERE id=?", [response.body.data.user.id]);
    const login = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
    if (role === 'admin') adminToken = login.body.data.token; else userToken = login.body.data.token;
  }
});
beforeEach(async () => {
  await assertTestDatabase();
  const response = await admin('post').send(body({ code: prefix + 'BASE' })).expect(201);
  promotionId = response.body.data.id;
});
afterEach(async () => {
  await assertTestDatabase();
  await pool.execute('DELETE FROM promotions WHERE code LIKE ?', [prefix + '%']);
});
afterAll(async () => {
  try {
    await assertTestDatabase();
    await pool.execute('DELETE FROM promotions WHERE code LIKE ?', [prefix + '%']);
    for (const email of emails) {
      await pool.execute('DELETE c FROM customers c JOIN users u ON c.user_id=u.id WHERE u.email=?', [email]);
      await pool.execute('DELETE FROM users WHERE email=?', [email]);
    }
  } finally { await pool.end(); }
});
describe('Promotion', () => {
  const routes = [['get', ''], ['get', '/id'], ['post', ''], ['patch', '/id'], ['patch', '/id/status']];
  test.each(routes)('no token cannot %s %s', async (method, suffix) => {
    await request(app)[method](endpoint + suffix.replace('id', promotionId)).send({ status: 'inactive' }).expect(401);
  });
  test.each(routes)('user cannot %s %s', async (method, suffix) => {
    await request(app)[method](endpoint + suffix.replace('id', promotionId)).auth(userToken, { type: 'bearer' }).send({ status: 'inactive' }).expect(403);
  });
  test('creates percentage promotion and persists correct values and Vietnam times', async () => {
    const response = await admin('post').send(body({ code: ` ${prefix.toLowerCase()}new `, start_at: '2020-01-01T08:00' })).expect(201);
    expect(response.body.data).toMatchObject({ code: prefix + 'NEW', discount_type: 'percentage', discount_value: '15.50', minimum_amount: '100000', max_discount_amount: '50000', start_at: '2020-01-01 08:00:00', end_at: '2099-12-31 23:59:59', status: 'active' });
    const [[row]] = await pool.execute("SELECT code,discount_type,discount_value,DATE_FORMAT(start_at,'%Y-%m-%d %H:%i:%s') AS start_at,status FROM promotions WHERE id=?", [response.body.data.id]);
    expect(row).toMatchObject({ code: prefix + 'NEW', discount_value: '15.50', discount_type: 'percentage', start_at: '2020-01-01 08:00:00', status: 'active' });
  });
  test('creates fixed promotion and preserves decimal database representation on status update', async () => {
    const response = await admin('post').send(body({ discount_type: 'fixed', discount_value: 50000, max_discount_amount: null })).expect(201);
    const id = response.body.data.id;
    expect(response.body.data).toMatchObject({ discount_type: 'fixed', discount_value: '50000.00', max_discount_amount: null });
    const updated = await admin('patch', `${endpoint}/${id}/status`).send({ status: 'inactive' }).expect(200);
    expect(updated.body.data.discount_value).toBe('50000.00');
  });
  test.each([
    ['zero discount', { discount_value: 0 }], ['negative discount', { discount_value: -1 }],
    ['percentage over 100', { discount_value: 100.01 }], ['excess precision', { discount_value: 1.234 }],
    ['fractional fixed amount', { discount_type: 'fixed', discount_value: 1.5, max_discount_amount: null }],
    ['fixed amount with cap', { discount_type: 'fixed', discount_value: 50000 }],
    ['equal dates', { end_at: '2020-01-01 08:00:00' }], ['reversed dates', { end_at: '2019-01-01 08:00:00' }],
    ['invalid calendar date', { start_at: '2025-02-30 08:00:00' }],
    ['empty code', { code: ' ' }], ['empty name', { name: ' ' }],
    ['invalid discount type', { discount_type: 'percent' }], ['invalid status', { status: 'expired' }],
    ['negative minimum', { minimum_amount: -1 }], ['zero cap', { max_discount_amount: 0 }],
  ])('rejects %s', async (label, overrides) => {
    await admin('post').send(body(overrides)).expect(400);
  });
  test('rejects missing required fields', async () => { await admin('post').send({ name: 'Missing fields' }).expect(400); });
  test('rejects duplicate normalized code', async () => {
    await admin('post').send(body({ code: ` ${prefix.toLowerCase()}base ` })).expect(409);
  });
  test('admin lists and reads detail including inactive promotions', async () => {
    await admin('patch', `${endpoint}/${promotionId}/status`).send({ status: 'inactive' }).expect(200);
    const list = await admin('get').expect(200);
    expect(list.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: promotionId, status: 'inactive' })]));
    const detail = await admin('get', `${endpoint}/${promotionId}`).expect(200);
    expect(detail.body.data.code).toBe(prefix + 'BASE');
  });
  test('missing detail and update return 404; malformed id returns 400', async () => {
    await admin('get', `${endpoint}/4294967295`).expect(404);
    await admin('patch', `${endpoint}/4294967295`).send({ name: 'Missing' }).expect(404);
    await admin('get', `${endpoint}/abc`).expect(400);
  });
  test('partial update preserves unrelated values and persists edited information', async () => {
    const before = (await admin('get', `${endpoint}/${promotionId}`)).body.data;
    const response = await admin('patch', `${endpoint}/${promotionId}`).send({ name: ' Updated ', description: 'Updated description' }).expect(200);
    expect(response.body.data).toMatchObject({ ...before, updated_at: expect.any(String), name: 'Updated', description: 'Updated description' });
    const [[row]] = await pool.execute('SELECT name,description FROM promotions WHERE id=?', [promotionId]);
    expect(row).toEqual({ name: 'Updated', description: 'Updated description' });
  });
  test('update validates merged dates and discount without modifying stored values', async () => {
    await admin('patch', `${endpoint}/${promotionId}`).send({ end_at: '2010-01-01 08:00:00' }).expect(400);
    await admin('patch', `${endpoint}/${promotionId}`).send({ discount_value: 101 }).expect(400);
    const response = await admin('get', `${endpoint}/${promotionId}`).expect(200);
    expect(response.body.data).toMatchObject({ discount_value: '15.50', end_at: '2099-12-31 23:59:59' });
  });
  test('rejects duplicate code on update', async () => {
    const response = await admin('post').send(body()).expect(201);
    await admin('patch', `${endpoint}/${response.body.data.id}`).send({ code: prefix + 'BASE' }).expect(409);
  });
  test('toggles active/inactive and active again without losing details', async () => {
    for (const status of ['inactive','active']) {
      const response = await admin('patch', `${endpoint}/${promotionId}/status`).send({ status }).expect(200);
      expect(response.body.data).toMatchObject({ status, name: 'Promotion Test', discount_value: '15.50' });
    }
    await admin('patch', `${endpoint}/${promotionId}/status`).send({ status: 'expired' }).expect(400);
  });
  test('public includes only active and currently valid promotions', async () => {
    const excluded = [];
    for (const [suffix, overrides] of [
      ['OFF', { status: 'inactive' }],
      ['FUTURE', { start_at: '2098-01-01 00:00:00' }],
      ['EXPIRED', { start_at: '2000-01-01 00:00:00', end_at: '2001-01-01 00:00:00' }],
    ]) {
      const response = await admin('post').send(body({ code: prefix + suffix, ...overrides })).expect(201);
      excluded.push(response.body.data.id);
    }
    const response = await request(app).get('/api/promotions/active').expect(200);
    const ids = response.body.data.map(row => row.id);
    expect(ids).toContain(promotionId);
    for (const id of excluded) expect(ids).not.toContain(id);
    await admin('patch', `${endpoint}/${promotionId}/status`).send({ status: 'inactive' }).expect(200);
    const hidden = await request(app).get('/api/promotions/active').auth(userToken, { type: 'bearer' }).expect(200);
    expect(hidden.body.data.map(row => row.id)).not.toContain(promotionId);
  });
});
