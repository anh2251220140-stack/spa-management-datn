const pool = require('../config/db');

async function list(req, res, next) {
  try {
    const [rows] = await pool.query("SELECT id, name, description, status FROM service_categories WHERE status = 'active' ORDER BY name, id");
    res.json({ data: rows });
  } catch (error) { next(error); }
}
async function listAdmin(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM service_categories ORDER BY id DESC');
    res.json({ data: rows });
  } catch (error) { next(error); }
}
async function save(req, res, next) {
  try {
    const id = req.params.id;
    let old = {};
    if (id) {
      if (!/^[1-9]\d*$/.test(id)) return res.status(400).json({ message: 'ID danh mục không hợp lệ.' });
      const [rows] = await pool.execute('SELECT * FROM service_categories WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy danh mục.' });
      old = rows[0];
    }
    const body = req.body || {};
    const name = body.name === undefined ? old.name : typeof body.name === 'string' ? body.name.trim() : '';
    const description = body.description === undefined ? old.description ?? null : body.description;
    const status = body.status ?? old.status ?? 'active';
    if (!name || name.length > 100 || (description !== null && (typeof description !== 'string' || Buffer.byteLength(description) > 60000)) || !['active','inactive'].includes(status)) {
      return res.status(400).json({ message: 'Tên danh mục là bắt buộc (tối đa 100 ký tự); mô tả và trạng thái phải hợp lệ.' });
    }
    let resultId = id;
    if (id) await pool.execute('UPDATE service_categories SET name = ?, description = ?, status = ? WHERE id = ?', [name, description, status, id]);
    else {
      const [result] = await pool.execute('INSERT INTO service_categories (name, description, status) VALUES (?, ?, ?)', [name, description, status]);
      resultId = result.insertId;
    }
    const [rows] = await pool.execute('SELECT * FROM service_categories WHERE id = ?', [resultId]);
    res.status(id ? 200 : 201).json({ data: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Tên danh mục đã tồn tại.' });
    next(error);
  }
}
module.exports = { list, listAdmin, save };
