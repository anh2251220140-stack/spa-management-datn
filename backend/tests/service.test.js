const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const request = require('supertest');

// Cấu hình trước khi import app: ảnh test không nằm trong uploads development.
const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'spa-service-test-'));
process.env.SERVICE_UPLOAD_DIR = uploadDirectory;
const app = require('../app');
const pool = require('../config/db');
const prefix = `test-${randomUUID()}-`;
const emails = [];
let adminToken;
let userToken;
let categoryId;
let otherCategoryId;
let serviceId;
let otherServiceId;
let secondServiceId;

const categoryEndpoint = '/api/admin/service-categories';
const serviceEndpoint = '/api/admin/services';
const ids = response => response.body.data.map(row => row.id);
const admin = (method, url) => request(app)[method](url).auth(adminToken, { type: 'bearer' });
const serviceBody = (overrides = {}) => ({
  category_id: categoryId, name: prefix + 'New service', description: 'Test description',
  benefits: 'Test benefits', suitability_notes: 'Test suitability',
  price: 150000, duration_minutes: 45, ...overrides,
});

async function assertTestDatabase() {
  const [[database]] = await pool.query('SELECT DATABASE() AS name');
  if (database.name !== 'spa_management_test') throw new Error('Unsafe test database');
}

beforeAll(async () => {
  await assertTestDatabase();
  for (const role of ['admin', 'user']) {
    const email = `${prefix}${role}@example.com`;
    emails.push(email);
    const password = 'SpaService123!';
    const registered = await request(app).post('/api/auth/register').send({
      email, password, full_name: 'Service Test', phone: '0900000000',
    }).expect(201);
    if (role === 'admin') {
      await pool.execute("UPDATE users SET role = 'admin' WHERE id = ?", [registered.body.data.user.id]);
    }
    const loggedIn = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
    if (role === 'admin') adminToken = loggedIn.body.data.token;
    else userToken = loggedIn.body.data.token;
  }
});

// Mỗi case có dữ liệu riêng, không phụ thuộc thứ tự chạy.
beforeEach(async () => {
  await assertTestDatabase();
  const [first] = await pool.execute('INSERT INTO service_categories (name) VALUES (?)', [prefix + 'Category A']);
  const [second] = await pool.execute('INSERT INTO service_categories (name) VALUES (?)', [prefix + 'Category B']);
  categoryId = first.insertId;
  otherCategoryId = second.insertId;
  const created = [];
  for (const [category, name] of [[categoryId, 'Alpha'], [categoryId, 'Beta'], [otherCategoryId, 'Alpha']]) {
    const [row] = await pool.execute(
      'INSERT INTO services (category_id,name,description,price,duration_minutes) VALUES (?,?,?,?,?)',
      [category, prefix + name, 'Test description', 100000, 30]
    );
    created.push(row.insertId);
  }
  [serviceId, secondServiceId, otherServiceId] = created;
});

afterEach(async () => {
  await assertTestDatabase();
  // Chỉ xóa bản ghi có tiền tố UUID của suite này, giữ nguyên dữ liệu khác.
  await pool.execute('DELETE s FROM services s JOIN service_categories c ON c.id=s.category_id WHERE c.name LIKE ?', [prefix + '%']);
  await pool.execute('DELETE FROM service_categories WHERE name LIKE ?', [prefix + '%']);
});

afterAll(async () => {
  try {
    await assertTestDatabase();
    for (const email of emails) {
      await pool.execute('DELETE c FROM customers c JOIN users u ON c.user_id=u.id WHERE u.email=?', [email]);
      await pool.execute('DELETE FROM users WHERE email=?', [email]);
    }
  } finally {
    await pool.end();
    // Chỉ dọn các file trực tiếp trong thư mục tạm riêng, không xóa đệ quy.
    for (const filename of fs.readdirSync(uploadDirectory)) fs.unlinkSync(path.join(uploadDirectory, filename));
    fs.rmdirSync(uploadDirectory);
    delete process.env.SERVICE_UPLOAD_DIR;
  }
});

describe('Service Category', () => {
  test('public lists active categories only', async () => {
    await pool.execute("UPDATE service_categories SET status='inactive' WHERE id=?", [otherCategoryId]);
    const response = await request(app).get('/api/service-categories').expect(200);
    expect(ids(response)).toContain(categoryId);
    expect(ids(response)).not.toContain(otherCategoryId);
    expect(response.body.data.every(row => row.status === 'active')).toBe(true);
  });
  test('admin lists active and inactive categories', async () => {
    await pool.execute("UPDATE service_categories SET status='inactive' WHERE id=?", [otherCategoryId]);
    const response = await admin('get', categoryEndpoint).expect(200);
    expect(ids(response)).toEqual(expect.arrayContaining([categoryId, otherCategoryId]));
  });
  test.each(['get', 'post', 'patch'])('user cannot %s admin categories', async method => {
    await request(app)[method](categoryEndpoint + (method === 'patch' ? `/${categoryId}` : ''))
      .auth(userToken, { type: 'bearer' }).send({ name: prefix + 'Denied' }).expect(403);
  });
  test.each(['get', 'post', 'patch'])('missing token cannot %s admin categories', async method => {
    await request(app)[method](categoryEndpoint + (method === 'patch' ? `/${categoryId}` : ''))
      .send({ name: prefix + 'Denied' }).expect(401);
  });
  test('admin creates a category', async () => {
    const response = await admin('post', categoryEndpoint).send({ name: prefix + 'New', description: 'New category' }).expect(201);
    const [[row]] = await pool.execute('SELECT * FROM service_categories WHERE id=?', [response.body.data.id]);
    expect(row.name).toBe(prefix + 'New');
    expect(row.status).toBe('active');
  });
  test('duplicate category name returns 409', async () => {
    await admin('post', categoryEndpoint).send({ name: prefix + 'Category A' }).expect(409);
  });
  test('empty category name returns 400', async () => {
    await admin('post', categoryEndpoint).send({ name: '   ' }).expect(400);
  });
  test('admin edits category information', async () => {
    const response = await admin('patch', `${categoryEndpoint}/${categoryId}`)
      .send({ name: prefix + 'Edited', description: 'Edited description' }).expect(200);
    expect(response.body.data).toMatchObject({ name: prefix + 'Edited', description: 'Edited description' });
    const listed = await request(app).get('/api/service-categories').expect(200);
    expect(listed.body.data.find(row => row.id === categoryId).name).toBe(prefix + 'Edited');
  });
  test('admin toggles category and public visibility follows', async () => {
    for (const status of ['inactive', 'active']) {
      const response = await admin('patch', `${categoryEndpoint}/${categoryId}`).send({ status }).expect(200);
      expect(response.body.data.status).toBe(status);
      const listed = await request(app).get('/api/service-categories').expect(200);
      expect(ids(listed).includes(categoryId)).toBe(status === 'active');
    }
  });
});

describe('Service', () => {
  test('public lists active services', async () => {
    const response = await request(app).get('/api/services').expect(200);
    expect(ids(response)).toEqual(expect.arrayContaining([serviceId, secondServiceId, otherServiceId]));
    expect(response.body.data.every(row => row.status === 'active' && row.category_status === 'active')).toBe(true);
  });
  test('public reads service detail', async () => {
    const response = await request(app).get(`/api/services/${serviceId}`).expect(200);
    expect(response.body.data).toMatchObject({ id: serviceId, category_id: categoryId, name: prefix + 'Alpha' });
  });
  test('missing service returns 404', async () => {
    await pool.execute('DELETE FROM services WHERE id=?', [serviceId]);
    await request(app).get(`/api/services/${serviceId}`).expect(404);
  });
  test('admin creates service with category and information', async () => {
    const response = await admin('post', serviceEndpoint).send(serviceBody()).expect(201);
    const [[row]] = await pool.execute('SELECT * FROM services WHERE id=?', [response.body.data.id]);
    expect(row).toMatchObject({ category_id: categoryId, name: prefix + 'New service', duration_minutes: 45, benefits: 'Test benefits', suitability_notes: 'Test suitability' });
    expect(Number(row.price)).toBe(150000);
  });
  test('nonexistent category returns 400', async () => {
    const [row] = await pool.execute('INSERT INTO service_categories (name) VALUES (?)', [prefix + 'Deleted']);
    await pool.execute('DELETE FROM service_categories WHERE id=?', [row.insertId]);
    await admin('post', serviceEndpoint).send(serviceBody({ category_id: row.insertId })).expect(400);
  });
  test('negative price returns 400', async () => {
    await admin('post', serviceEndpoint).send(serviceBody({ price: -1 })).expect(400);
  });
  test.each([0, -1])('duration %s returns 400', async duration => {
    await admin('post', serviceEndpoint).send(serviceBody({ duration_minutes: duration })).expect(400);
  });
  test('duplicate service in same category returns 409', async () => {
    await admin('post', serviceEndpoint).send(serviceBody({ name: prefix + 'Alpha' })).expect(409);
  });
  test('same service name in another category is allowed', async () => {
    await admin('post', serviceEndpoint).send(serviceBody({ category_id: otherCategoryId, name: prefix + 'Beta' })).expect(201);
  });
  test('admin edits service information', async () => {
    const body = serviceBody({ name: prefix + 'Edited', category_id: otherCategoryId, price: 250000, duration_minutes: 60 });
    await admin('patch', `${serviceEndpoint}/${serviceId}`).send(body).expect(200);
    const response = await request(app).get(`/api/services/${serviceId}`).expect(200);
    expect(response.body.data).toMatchObject({ name: body.name, category_id: otherCategoryId, duration_minutes: 60, benefits: body.benefits });
    expect(Number(response.body.data.price)).toBe(250000);
  });
  test('inactive service is hidden in public list and detail, still visible to admin', async () => {
    await admin('patch', `${serviceEndpoint}/${serviceId}`).send({ status: 'inactive' }).expect(200);
    expect(ids(await request(app).get('/api/services').expect(200))).not.toContain(serviceId);
    await request(app).get(`/api/services/${serviceId}`).expect(404);
    const listed = await admin('get', serviceEndpoint).expect(200);
    expect(ids(listed)).toContain(serviceId);
    await admin('get', `${serviceEndpoint}/${serviceId}`).expect(200);
    await admin('patch', `${serviceEndpoint}/${serviceId}`).send({ status: 'active' }).expect(200);
    await request(app).get(`/api/services/${serviceId}`).expect(200);
  });
  test('inactive category hides services; enabling it restores only active services', async () => {
    await admin('patch', `${serviceEndpoint}/${secondServiceId}`).send({ status: 'inactive' }).expect(200);
    await admin('patch', `${categoryEndpoint}/${categoryId}`).send({ status: 'inactive' }).expect(200);
    const hidden = await request(app).get('/api/services').expect(200);
    expect(ids(hidden)).not.toContain(serviceId);
    await request(app).get(`/api/services/${serviceId}`).expect(404);
    await admin('patch', `${categoryEndpoint}/${categoryId}`).send({ status: 'active' }).expect(200);
    const restored = await request(app).get('/api/services').expect(200);
    expect(ids(restored)).toContain(serviceId);
    expect(ids(restored)).not.toContain(secondServiceId);
    await request(app).get(`/api/services/${serviceId}`).expect(200);
  });
  test.each(['get', 'post', 'patch'])('admin service %s rejects user and missing token', async method => {
    const url = serviceEndpoint + (method === 'patch' ? `/${serviceId}` : '');
    await request(app)[method](url).send(serviceBody()).expect(401);
    await request(app)[method](url).auth(userToken, { type: 'bearer' }).send(serviceBody()).expect(403);
  });
});

describe('Search / Filter', () => {
  test('search by name returns matching services', async () => {
    const response = await request(app).get('/api/services').query({ search: prefix + 'Alpha' }).expect(200);
    expect(ids(response).sort()).toEqual([serviceId, otherServiceId].sort());
  });
  test('category filter returns only that category', async () => {
    const response = await request(app).get('/api/services').query({ category_id: categoryId }).expect(200);
    expect(ids(response).sort()).toEqual([serviceId, secondServiceId].sort());
  });
  test('search and category filter work together', async () => {
    const response = await request(app).get('/api/services').query({ search: prefix + 'Alpha', category_id: categoryId }).expect(200);
    expect(ids(response)).toEqual([serviceId]);
  });
  test('malformed category returns 400', async () => {
    await request(app).get('/api/services').query({ category_id: 'abc' }).expect(400);
  });
});

describe('Service image upload', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
  test('valid PNG is stored and served; replacement removes the old test image', async () => {
    const first = await admin('patch', `${serviceEndpoint}/${serviceId}`)
      .attach('image', png, { filename: 'pixel.png', contentType: 'image/png' }).expect(200);
    const url = first.body.data.image_url;
    expect(url).toMatch(/^\/uploads\/services\/[a-f0-9-]+\.png$/);
    expect(fs.readFileSync(path.join(uploadDirectory, path.basename(url)))).toEqual(png);
    const fetched = await request(app).get(url).expect(200).expect('Content-Type', /image\/png/);
    expect(fetched.body).toEqual(png);
    const second = await admin('patch', `${serviceEndpoint}/${serviceId}`)
      .attach('image', png, { filename: 'replacement.png', contentType: 'image/png' }).expect(200);
    expect(second.body.data.image_url).not.toBe(url);
    expect(fs.existsSync(path.join(uploadDirectory, path.basename(url)))).toBe(false);
  });
  test('unsupported file type is rejected without saving image', async () => {
    const before = fs.readdirSync(uploadDirectory);
    await admin('patch', `${serviceEndpoint}/${serviceId}`)
      .attach('image', Buffer.from('not an image'), { filename: 'notes.txt', contentType: 'text/plain' }).expect(400);
    expect(fs.readdirSync(uploadDirectory)).toEqual(before);
    const [[row]] = await pool.execute('SELECT image_url FROM services WHERE id=?', [serviceId]);
    expect(row.image_url).toBeNull();
  });
  test('fake PNG content is rejected', async () => {
    await admin('patch', `${serviceEndpoint}/${serviceId}`)
      .attach('image', Buffer.from('not a PNG'), { filename: 'fake.png', contentType: 'image/png' }).expect(400);
  });
});
