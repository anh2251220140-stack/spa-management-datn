const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'spa-avatar-test-'));
process.env.AVATAR_UPLOAD_DIR = directory;
const app = require('../app');
const pool = require('../config/db');
const accounts = [];
const prefix = `profile-${randomUUID()}`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
const endpoint = '/api/profile/me';
const own = method => request(app)[method](endpoint).auth(accounts[0].token, { type: 'bearer' });
async function assertTestDatabase() {
  const [[database]] = await pool.query('SELECT DATABASE() AS name');
  if (database.name !== 'spa_management_test') throw new Error('Unsafe test database');
}
beforeAll(async () => {
  await assertTestDatabase();
  for (const role of ['user', 'other', 'admin']) {
    const email = `${prefix}-${role}@example.com`;
    const password = 'ProfileTest123!';
    accounts.push({ email });
    const registered = await request(app).post('/api/auth/register').send({ email, password, full_name: 'Profile Test', phone: '0900000000' }).expect(201);
    const account = accounts[accounts.length - 1];
    account.id = registered.body.data.user.id;
    account.customerId = registered.body.data.customer.id;
    if (role === 'admin') await pool.execute("UPDATE users SET role='admin' WHERE id=?", [account.id]);
    const response = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
    account.token = response.body.data.token;
  }
});
afterAll(async () => {
  try {
    await assertTestDatabase();
    for (const { email } of accounts) {
      await pool.execute('DELETE c FROM customers c JOIN users u ON c.user_id=u.id WHERE u.email=?', [email]);
      await pool.execute('DELETE FROM users WHERE email=?', [email]);
    }
  } finally {
    await pool.end();
    for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name));
    fs.rmdirSync(directory);
    delete process.env.AVATAR_UPLOAD_DIR;
  }
});
describe('Own profile and avatar', () => {
  test('requires authentication', async () => { await request(app).get(endpoint).expect(401); });
  test('admin cannot use customer profile endpoint', async () => {
    await request(app).get(endpoint).auth(accounts[2].token, { type: 'bearer' }).expect(403);
  });
  test('returns own profile without password hash', async () => {
    const response = await own('get').expect(200);
    expect(response.body.data).toMatchObject({ id: accounts[0].customerId, email: accounts[0].email });
    expect(response.body.data).not.toHaveProperty('password_hash');
  });
  test('updates and persists trimmed name and phone', async () => {
    await own('patch').send({ full_name: ' Updated Profile ', phone: ' 0912345678 ' }).expect(200);
    const response = await own('get').expect(200);
    expect(response.body.data).toMatchObject({ full_name: 'Updated Profile', phone: '0912345678' });
  });
  test('rejects customer identity override and preserves other profile', async () => {
    await own('patch').send({ customer_id: accounts[1].customerId, full_name: 'Attack' }).expect(400);
    const [[other]] = await pool.execute('SELECT full_name FROM customers WHERE id=?', [accounts[1].customerId]);
    expect(other.full_name).toBe('Profile Test');
  });
  test('rejects email modification', async () => {
    await own('patch').send({ email: 'changed@example.com' }).expect(400);
  });
  test('rejects empty name and oversized phone', async () => {
    await own('patch').send({ full_name: ' ' }).expect(400);
    await own('patch').send({ phone: '1'.repeat(21) }).expect(400);
  });
  test('uploads, serves and replaces avatar only for current user', async () => {
    const first = await own('patch').attach('image', png, { filename: 'avatar.png', contentType: 'image/png' }).expect(200);
    const firstUrl = first.body.data.avatar_url;
    expect(fs.readFileSync(path.join(directory, path.basename(firstUrl)))).toEqual(png);
    await request(app).get(firstUrl).expect(200).expect('X-Content-Type-Options', 'nosniff');
    const second = await own('patch').attach('image', png, { filename: 'new.png', contentType: 'image/png' }).expect(200);
    expect(second.body.data.avatar_url).not.toBe(firstUrl);
    expect(fs.existsSync(path.join(directory, path.basename(firstUrl)))).toBe(false);
    const response = await own('get').expect(200);
    expect(response.body.data.avatar_url).toBe(second.body.data.avatar_url);
    const [[other]] = await pool.execute('SELECT avatar_url FROM customers WHERE id=?', [accounts[1].customerId]);
    expect(other.avatar_url).toBeNull();
  });
  test('rejects invalid file type and forged image content', async () => {
    await own('patch').attach('image', Buffer.from('text'), { filename: 'file.txt', contentType: 'text/plain' }).expect(400);
    await own('patch').attach('image', Buffer.from('text'), { filename: 'fake.png', contentType: 'image/png' }).expect(400);
  });
  test('rejects avatar larger than 5 MB without writing a file', async () => {
    const before = fs.readdirSync(directory);
    await own('patch').attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), { filename: 'large.png', contentType: 'image/png' }).expect(400);
    expect(fs.readdirSync(directory)).toEqual(before);
  });
});
