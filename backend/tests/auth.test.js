const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const app = require('../app');
const pool = require('../config/db');

const password = 'SpaTest123!';
const newPassword = 'SpaNewPassword456!';
const emails = [];
let account;
let userId;

// Mỗi test có tài khoản riêng; không phụ thuộc thứ tự chạy.
beforeEach(async () => {
  account = {
    email: `auth.${randomUUID()}@example.com`,
    password,
    full_name: 'Authentication Test',
    phone: '0900000000',
  };
  emails.push(account.email);
  const response = await request(app).post('/api/auth/register').send(account);
  expect(response.status).toBe(201);
  userId = response.body.data.user.id;
});

afterAll(async () => {
  try {
    const [[database]] = await pool.query('SELECT DATABASE() AS name');
    if (database.name !== 'spa_management_test') throw new Error('Refusing cleanup outside test database');
    for (const email of emails) {
      await pool.execute('DELETE c FROM customers c JOIN users u ON c.user_id = u.id WHERE u.email = ?', [email]);
      await pool.execute('DELETE FROM users WHERE email = ?', [email]);
    }
  } finally {
    await pool.end();
  }
});

async function login() {
  const response = await request(app).post('/api/auth/login').send({ email: account.email, password });
  expect(response.status).toBe(200);
  return response.body.data.token;
}

describe('Authentication', () => {
  test('register returns 201 and normalizes email', async () => {
    const email = `auth.${randomUUID()}@example.com`;
    emails.push(email);
    const response = await request(app).post('/api/auth/register')
      .send({ ...account, email: `  ${email.toUpperCase()}  ` });
    expect(response.status).toBe(201);
    expect(response.body.data.user.email).toBe(email);
    expect(response.body.data.user).not.toHaveProperty('password_hash');
  });

  test('duplicate normalized email returns 409', async () => {
    const response = await request(app).post('/api/auth/register')
      .send({ ...account, email: ` ${account.email.toUpperCase()} ` });
    expect(response.status).toBe(409);
    const [[row]] = await pool.execute('SELECT COUNT(*) AS total FROM users WHERE email = ?', [account.email]);
    expect(row.total).toBe(1);
  });

  test('public register rejects admin role without creating account', async () => {
    const email = `auth.${randomUUID()}@example.com`;
    emails.push(email);
    const response = await request(app).post('/api/auth/register').send({ ...account, email, role: 'admin' });
    expect(response.status).toBe(400);
    const [rows] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    expect(rows).toHaveLength(0);
  });

  test('registered account has user role in database', async () => {
    const [[user]] = await pool.execute('SELECT role FROM users WHERE id = ?', [userId]);
    expect(user.role).toBe('user');
  });

  test('customer is linked to the registered user', async () => {
    const [rows] = await pool.execute('SELECT user_id, full_name, phone FROM customers WHERE user_id = ?', [userId]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: userId, full_name: account.full_name, phone: account.phone });
  });

  test('database stores a bcrypt hash rather than plain password', async () => {
    const [[user]] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [userId]);
    expect(user.password_hash).not.toBe(password);
    expect(await bcrypt.compare(password, user.password_hash)).toBe(true);
  });

  test('correct credentials return 200 and a valid JWT', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: account.email, password });
    expect(response.status).toBe(200);
    const payload = jwt.verify(response.body.data.token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    expect(payload.sub).toBe(String(userId));
    expect(response.body.data.user).not.toHaveProperty('password_hash');
  });

  test('wrong password returns 401', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: account.email, password: 'WrongPassword123!' });
    expect(response.status).toBe(401);
  });

  test('locked account cannot log in', async () => {
    await pool.execute("UPDATE users SET status = 'locked' WHERE id = ?", [userId]);
    const response = await request(app).post('/api/auth/login').send({ email: account.email, password });
    expect(response.status).toBe(403);
  });

  test('me without token returns 401', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
  });

  test('me with valid token returns current account and customer', async () => {
    const token = await login();
    const response = await request(app).get('/api/auth/me').auth(token, { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body.data.user.id).toBe(userId);
    expect(response.body.data.customer.full_name).toBe(account.full_name);
    expect(response.body.data.user).not.toHaveProperty('password_hash');
  });

  test('locking account invalidates access with an existing token', async () => {
    const token = await login();
    await pool.execute("UPDATE users SET status = 'locked' WHERE id = ?", [userId]);
    const response = await request(app).get('/api/auth/me').auth(token, { type: 'bearer' });
    expect(response.status).toBe(403);
  });

  test('password change returns 200, rejects old password and accepts new password', async () => {
    const token = await login();
    const response = await request(app).patch('/api/auth/change-password').auth(token, { type: 'bearer' })
      .send({ current_password: password, new_password: newPassword });
    expect(response.status).toBe(200);
    const oldLogin = await request(app).post('/api/auth/login').send({ email: account.email, password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post('/api/auth/login').send({ email: account.email, password: newPassword });
    expect(newLogin.status).toBe(200);
    const [[user]] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [userId]);
    expect(user.password_hash).not.toBe(newPassword);
    expect(await bcrypt.compare(newPassword, user.password_hash)).toBe(true);
  });

  test('wrong current password returns 401 and leaves password unchanged', async () => {
    const token = await login();
    const response = await request(app).patch('/api/auth/change-password').auth(token, { type: 'bearer' })
      .send({ current_password: 'WrongPassword123!', new_password: newPassword });
    expect(response.status).toBe(401);
    await login();
  });

  test('user cannot access admin endpoint', async () => {
    const token = await login();
    const response = await request(app).get('/api/auth/admin-check').auth(token, { type: 'bearer' });
    expect(response.status).toBe(403);
  });

  test('admin can access admin endpoint using current database role', async () => {
    const token = await login();
    await pool.execute("UPDATE users SET role = 'admin' WHERE id = ?", [userId]);
    const response = await request(app).get('/api/auth/admin-check').auth(token, { type: 'bearer' });
    expect(response.status).toBe(200);
  });
});
