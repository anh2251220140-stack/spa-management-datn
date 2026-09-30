const request = require('supertest');
const { randomUUID } = require('node:crypto');
const app = require('../app');
const pool = require('../config/db');
const prefix = `REVTEST-${randomUUID().slice(0, 16)}-`;
const accounts = {}, emails = [];
let categoryId, serviceId, employeeId, appointmentId;
const endpoint = '/api/reviews';
const api = (method, url = endpoint, role = 'admin') => request(app)[method](url).auth(accounts[role].token, { type: 'bearer' });
const create = (overrides = {}) => api('post', endpoint, 'user').send({ appointment_id: appointmentId, rating: 5, comment: '  Good  ', ...overrides });
async function guard() {
  const [[db]] = await pool.query('SELECT DATABASE() AS name');
  if (db.name !== 'spa_management_test') throw new Error('Unsafe review test database');
}
async function appointment(customerId = accounts.user.customerId, status = 'completed') {
  const [row] = await pool.execute(`INSERT INTO appointments (customer_id,employee_id,service_id,start_at,end_at,service_name_snapshot,booked_price,status)
    VALUES (?,?,?,'2020-01-01 09:00:00','2020-01-01 10:00:00',?,200000,?)`, [customerId,employeeId,serviceId,'Booking snapshot',status]);
  return row.insertId;
}
beforeAll(async () => {
  await guard();
  for (const role of ['user','other','admin']) {
    const email = prefix + role + '@example.com', password = 'ReviewTest123!'; emails.push(email);
    const response = await request(app).post('/api/auth/register').send({ email,password,full_name:'Review '+role,phone:'0900000000' }).expect(201);
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
});
afterEach(async () => {
  await guard();
  await pool.execute('DELETE rr FROM review_replies rr JOIN reviews r ON r.id=rr.review_id JOIN appointments a ON a.id=r.appointment_id JOIN employees e ON e.id=a.employee_id WHERE e.full_name LIKE ?', [prefix+'%']);
  await pool.execute('DELETE r FROM reviews r JOIN appointments a ON a.id=r.appointment_id JOIN employees e ON e.id=a.employee_id WHERE e.full_name LIKE ?', [prefix+'%']);
  // Chỉ dọn dữ liệu thuộc danh mục/nhân viên UUID của suite theo thứ tự FK.
  await pool.execute('DELETE a FROM appointments a JOIN employees e ON e.id=a.employee_id WHERE e.full_name LIKE ?', [prefix+'%']);
  await pool.execute('DELETE es FROM employee_services es JOIN employees e ON e.id=es.employee_id WHERE e.full_name LIKE ?', [prefix+'%']);
  await pool.execute('DELETE FROM employees WHERE full_name LIKE ?', [prefix+'%']);
  await pool.execute('DELETE s FROM services s JOIN service_categories c ON c.id=s.category_id WHERE c.name LIKE ?', [prefix+'%']);
  await pool.execute('DELETE FROM service_categories WHERE name LIKE ?', [prefix+'%']);
});
afterAll(async () => {
  try { await guard(); for(const email of emails) {
    await pool.execute('DELETE c FROM customers c JOIN users u ON u.id=c.user_id WHERE u.email=?', [email]);
    await pool.execute('DELETE FROM users WHERE email=?', [email]);
  } } finally { await pool.end(); }
});
describe('Review', () => {
  const edit = (id, body, role = 'user') => api('patch', `/api/reviews/${id}`, role).send(body);
  test('creates review for own completed appointment without invoice or payment', async () => {
    const saved = (await create().expect(201)).body.data;
    expect(saved).toMatchObject({ appointment_id: appointmentId, rating: 5, comment: 'Good', content_version: 1, service_name: 'Booking snapshot', customer_name: expect.any(String), created_at: expect.any(String), updated_at: expect.any(String) });
  });
  test.each(['pending', 'confirmed', 'cancelled'])('rejects %s appointment', async status => {
    await pool.execute('UPDATE appointments SET status=?,cancelled_at=? WHERE id=?', [status, status === 'cancelled' ? '2020-01-01 08:00:00' : null, appointmentId]);
    await create().expect(409);
  });
  test('rejects another customer appointment', async () => {
    const other = await appointment(accounts.other.customerId); await create({ appointment_id: other }).expect(404);
  });
  test('duplicate returns clear 409', async () => {
    await create().expect(201); const response = await create().expect(409); expect(response.body.message).toContain('đã được đánh giá');
  });
  test('concurrent create stores exactly one review', async () => {
    const responses = await Promise.all([create(), create()]); expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    const [[row]] = await pool.execute('SELECT COUNT(*) total FROM reviews WHERE appointment_id=?', [appointmentId]); expect(row.total).toBe(1);
  });
  test.each([0, 6, 1.5, '5', null, true])('rejects invalid rating %j', async rating => { await create({ rating }).expect(400); });
  test('rejects missing rating', async () => { await api('post', endpoint, 'user').send({ appointment_id: appointmentId }).expect(400); });
  test('rejects comment over 2000 characters on create and update', async () => {
    await create({ comment: 'a'.repeat(2001) }).expect(400);
    const saved = (await create().expect(201)).body.data;
    await edit(saved.id, { comment: 'a'.repeat(2001) }).expect(400);
  });
  test.each(['   ', null, undefined])('normalizes empty optional comment %j to NULL', async comment => {
    expect((await create({ comment }).expect(201)).body.data.comment).toBeNull();
  });
  test('accepts 2000 character comment', async () => { expect((await create({ comment: 'a'.repeat(2000) }).expect(201)).body.data.comment).toHaveLength(2000); });
  test('rejects non-string comment', async () => { await create({ comment: {} }).expect(400); });
  test('own appointment without review returns null', async () => { expect((await api('get', `${endpoint}/${appointmentId}`, 'user').expect(200)).body.data).toBeNull(); });
  test('user reads own review through appointment', async () => {
    const saved = (await create().expect(201)).body.data;
    expect((await api('get', `${endpoint}/${appointmentId}`, 'user').expect(200)).body.data.id).toBe(saved.id);
  });
  test('updates only own rating or comment and increments version', async () => {
    const saved = (await create().expect(201)).body.data;
    expect((await edit(saved.id, { rating: 4 }).expect(200)).body.data).toMatchObject({ rating: 4, comment: 'Good', content_version: 2 });
    expect((await edit(saved.id, { comment: ' New ' }).expect(200)).body.data).toMatchObject({ rating: 4, comment: 'New', content_version: 3 });
  });
  test('same normalized content does not change version or updated_at', async () => {
    const saved = (await create().expect(201)).body.data;
    const response = await edit(saved.id, { rating: 5, comment: ' Good ' }).expect(200);
    expect(response.body.data).toEqual(saved);
  });
  test('blank edit becomes NULL and repeated blank does not increment', async () => {
    const saved = (await create().expect(201)).body.data;
    expect((await edit(saved.id, { comment: ' ' }).expect(200)).body.data).toMatchObject({ comment: null, content_version: 2 });
    expect((await edit(saved.id, { comment: null }).expect(200)).body.data.content_version).toBe(2);
  });
  test('cannot change appointment_id or version', async () => {
    const saved = (await create().expect(201)).body.data;
    await edit(saved.id, { appointment_id: appointmentId }).expect(400);
    await edit(saved.id, { content_version: 100 }).expect(400);
  });
  test('user cannot read or modify another user review', async () => {
    const saved = (await create().expect(201)).body.data;
    await api('get', `${endpoint}/${appointmentId}`, 'other').expect(404);
    await edit(saved.id, { rating: 1 }, 'other').expect(404);
  });
  test('admin lists and reads review with customer and service snapshot', async () => {
    const saved = (await create().expect(201)).body.data;
    await pool.execute('UPDATE services SET name=? WHERE id=?', [prefix + 'Renamed', serviceId]);
    expect((await api('get', '/api/admin/reviews').expect(200)).body.data.map(r => r.id)).toContain(saved.id);
    expect((await api('get', `/api/admin/reviews/${saved.id}`).expect(200)).body.data).toEqual(saved);
  });
  test('regular user cannot access admin endpoints', async () => {
    await api('get', '/api/admin/reviews', 'user').expect(403); await api('get', '/api/admin/reviews/1', 'user').expect(403);
  });
  test('admin cannot create or edit reviews', async () => {
    const saved = (await create().expect(201)).body.data;
    await api('post', endpoint).send({ appointment_id: appointmentId, rating: 5 }).expect(403);
    await edit(saved.id, { rating: 1 }, 'admin').expect(403);
  });
  test('all endpoints require JWT', async () => {
    for (const url of ['/api/reviews/1', '/api/admin/reviews', '/api/admin/reviews/1']) await request(app).get(url).expect(401);
    await request(app).post(endpoint).send({}).expect(401); await request(app).patch(endpoint + '/1').send({}).expect(401);
  });
  test('missing records and malformed IDs are rejected', async () => {
    await create({ appointment_id: 4294967295 }).expect(404);
    await create({ appointment_id: 'abc' }).expect(400);
    await edit(4294967295, { rating: 1 }).expect(404);
    await api('get', '/api/admin/reviews/4294967295').expect(404);
  });
});
describe('Review replies', () => {
  let review;
  const url = (admin = false, id = review.id) => `/api/${admin ? 'admin/' : ''}reviews/${id}/replies`;
  const send = (message = 'Thank you', role = 'user') => api('post', url(role === 'admin'), role).send({ message });
  beforeEach(async () => { review = (await create().expect(201)).body.data; });
  test('owner reads and sends, with trimmed message and authenticated sender', async () => {
    expect((await api('get', url(), 'user').expect(200)).body.data).toEqual([]);
    const reply = (await send('  Thank you  ').expect(201)).body.data;
    const [[owner]] = await pool.execute('SELECT user_id FROM customers WHERE id=?', [accounts.user.customerId]);
    expect(reply).toMatchObject({ review_id:review.id,user_id:owner.user_id,message:'Thank you',role:'user',sender_name:'Review user' });
    expect(reply).not.toHaveProperty('email');
    expect((await api('get', url(), 'user').expect(200)).body.data).toHaveLength(1);
  });
  test('another customer cannot read or send', async () => {
    await api('get', url(), 'other').expect(404);
    await api('post', url(), 'other').send({message:'Hello'}).expect(404);
  });
  test('admin reads and replies to multiple customer reviews', async () => {
    for (const id of [review.id, (await api('post', endpoint, 'other').send({appointment_id:await appointment(accounts.other.customerId),rating:4}).expect(201)).body.data.id]) {
      await api('get', url(true,id)).expect(200);
      const response = await api('post', url(true,id)).send({message:'Spa reply'}).expect(201);
      expect(response.body.data).toMatchObject({role:'admin',sender_name:'An Nhiên Spa',review_id:id});
    }
  });
  test('admin endpoints reject regular user', async () => {
    await api('get', url(true), 'user').expect(403);
    await api('post', url(true), 'user').send({message:'Hello'}).expect(403);
  });
  test('all reply endpoints require token', async () => {
    for (const admin of [false,true]) {
      await request(app).get(url(admin)).expect(401);
      await request(app).post(url(admin)).send({message:'Hello'}).expect(401);
    }
  });
  test('missing review is 404 for both roles', async () => {
    for (const role of ['user','admin']) {
      await api('get', url(role==='admin',4294967295),role).expect(404);
      await api('post', url(role==='admin',4294967295),role).send({message:'Hello'}).expect(404);
    }
  });
  test.each([undefined,null,123,{},[],true,'   ','x'.repeat(2001)])('rejects invalid message %#', async message => {
    await api('post',url(),'user').send(message === undefined ? {} : {message}).expect(400);
  });
  test('missing message is rejected', async () => { await api('post',url(),'user').send({}).expect(400); });
  test('exactly 2000 characters are accepted', async () => { await send('x'.repeat(2000)).expect(201); });
  test.each([{user_id:1},{role:'admin'}])('rejects spoofed sender %j', async extra => {
    await api('post',url(),'user').send({message:'Hello',...extra}).expect(400);
    expect((await api('get',url(),'user')).body.data).toEqual([]);
  });
  test('multiple replies ordered by timestamp and ID', async () => {
    const records=[];
    for (const role of ['user','user','admin','user','admin']) records.push((await send(role,role).expect(201)).body.data);
    await pool.execute("UPDATE review_replies SET created_at='2020-01-02 10:00:00' WHERE review_id=?",[review.id]);
    await pool.execute("UPDATE review_replies SET created_at='2020-01-01 10:00:00' WHERE id=?",[records[4].id]);
    expect((await api('get',url(),'user').expect(200)).body.data.map(row=>row.id)).toEqual([records[4].id,...records.slice(0,4).map(row=>row.id)]);
  });
  test('replies preserve every original review field and survive review edit', async () => {
    await pool.execute("UPDATE reviews SET updated_at='2020-01-01 00:00:00' WHERE id=?",[review.id]);
    const [[before]]=await pool.execute('SELECT * FROM reviews WHERE id=?',[review.id]);
    await send().expect(201); await send('Spa','admin').expect(201);
    const [[after]]=await pool.execute('SELECT * FROM reviews WHERE id=?',[review.id]);
    expect(after).toEqual(before);
    await api('patch',`/api/reviews/${review.id}`,'user').send({rating:4}).expect(200);
    expect((await api('get',url(),'user')).body.data).toHaveLength(2);
  });
});
describe('Public service reviews', () => {
  const get = (id = serviceId) => request(app).get(`/api/services/${id}/reviews`);
  async function add(rating = 5) {
    const id = await appointment();
    return (await create({appointment_id:id,rating}).expect(201)).body.data;
  }
  test('public completed reviews, average and total without token', async () => {
    const first=await add(5), second=await add(4), third=await add(5);
    await pool.execute("UPDATE reviews SET created_at='2020-01-01 00:00:00' WHERE appointment_id IN (SELECT id FROM appointments WHERE employee_id=?)",[employeeId]);
    await pool.execute("UPDATE reviews SET created_at='2020-01-02 00:00:00' WHERE id=?",[first.id]);
    const data=(await get().expect(200)).body.data;
    expect(data).toMatchObject({service_id:serviceId,average_rating:4.7,total_reviews:3});
    expect(data.reviews.map(row=>row.review_id)).toEqual([first.id,third.id,second.id]);
    expect(data.reviews[0]).toMatchObject({customer_name:'Review user',rating:5,comment:'Good',replies:[]});
  });
  test('excludes other service reviews', async () => {
    const saved=await add();
    const [other]=await pool.execute('INSERT INTO services (category_id,name,description,price,duration_minutes) VALUES (?,?,?,?,60)',[categoryId,prefix+'Other','Other',10000]);
    await pool.execute('INSERT INTO employee_services (employee_id,service_id) VALUES (?,?)',[employeeId,other.insertId]);
    await pool.execute('UPDATE appointments SET service_id=? WHERE id=?',[other.insertId,saved.appointment_id]);
    expect((await get().expect(200)).body.data.total_reviews).toBe(0);
    expect((await get(other.insertId).expect(200)).body.data.reviews[0].review_id).toBe(saved.id);
  });
  test.each(['pending','confirmed','cancelled'])('excludes %s appointments and replies from totals', async status => {
    const saved=await add(1); await add(5);
    await api('post',`/api/admin/reviews/${saved.id}/replies`).send({message:'Hidden'}).expect(201);
    await pool.execute('UPDATE appointments SET status=?,cancelled_at=? WHERE id=?',[status,status==='cancelled'?'2020-01-01 00:00:00':null,saved.appointment_id]);
    const data=(await get().expect(200)).body.data;
    expect(data.total_reviews).toBe(1); expect(data.average_rating).toBe(5);
    expect(data.reviews.some(row=>row.review_id===saved.id)).toBe(false);
  });
  test('no reviews returns empty list and zero average', async () => {
    expect((await get().expect(200)).body.data).toEqual({service_id:serviceId,average_rating:0,total_reviews:0,reviews:[]});
  });
  test('public replies ordered and grouped, with explicit safe fields only', async () => {
    const saved=await add(), other=await add();
    const replies=[];
    for (const role of ['user','admin','user']) {
      replies.push((await api('post',`/api/${role==='admin'?'admin/':''}reviews/${saved.id}/replies`,role).send({message:role}).expect(201)).body.data);
    }
    await pool.execute("UPDATE review_replies SET created_at='2020-01-02 00:00:00' WHERE review_id=?",[saved.id]);
    await pool.execute("UPDATE review_replies SET created_at='2020-01-01 00:00:00' WHERE id=?",[replies[2].id]);
    const data=(await get().expect(200)).body.data;
    const review=data.reviews.find(row=>row.review_id===saved.id);
    expect(review.replies.map(row=>row.id)).toEqual([replies[2].id,replies[0].id,replies[1].id]);
    expect(review.replies.map(row=>row.sender_label)).toEqual(['Review user','Review user','An Nhiên Spa']);
    expect(data.reviews.find(row=>row.review_id===other.id).replies).toEqual([]);
    expect(Object.keys(data).sort()).toEqual(['average_rating','reviews','service_id','total_reviews']);
    for (const row of data.reviews) {
      expect(Object.keys(row).sort()).toEqual(['comment','created_at','customer_name','rating','replies','review_id']);
      for (const reply of row.replies) expect(Object.keys(reply).sort()).toEqual(['created_at','id','message','sender_label']);
    }
  });
  test('missing and invalid service IDs', async () => { await get(4294967295).expect(404); await get('abc').expect(400); });
  test('inactive service or category is not public', async () => {
    await add();
    await pool.execute("UPDATE services SET status='inactive' WHERE id=?",[serviceId]); await get().expect(404);
    await pool.execute("UPDATE services SET status='active' WHERE id=?",[serviceId]);
    await pool.execute("UPDATE service_categories SET status='inactive' WHERE id=?",[categoryId]); await get().expect(404);
  });
});
