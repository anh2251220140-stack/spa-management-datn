const pool = require('../config/db');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const uploadDirectory = path.join(__dirname, '..', 'uploads', 'services');
const select = 'SELECT s.*, c.name AS category_name, c.status AS category_status FROM services s JOIN service_categories c ON c.id = s.category_id';

async function listServices(req, res, next, isAdmin) {
  try {
    const conditions = isAdmin ? [] : ["s.status = 'active'", "c.status = 'active'"];
    const values = [];
    if (req.query.search !== undefined) {
      if (typeof req.query.search !== 'string' || req.query.search.length > 150) return res.status(400).json({ message: 'Từ khóa tìm kiếm không hợp lệ.' });
      conditions.push('LOCATE(?, s.name) > 0'); values.push(req.query.search.trim());
    }
    if (req.query.category_id !== undefined) {
      if (typeof req.query.category_id !== 'string' || !/^[1-9]\d*$/.test(req.query.category_id)) return res.status(400).json({ message: 'ID danh mục không hợp lệ.' });
      conditions.push('s.category_id = ?'); values.push(req.query.category_id);
    }
    const [rows] = await pool.execute(select + (conditions.length ? ' WHERE ' + conditions.join(' AND ') : '') + ' ORDER BY s.id DESC', values);
    res.json({ data: rows });
  } catch (error) { next(error); }
}
async function detailService(req, res, next, isAdmin) {
  try {
    if (!/^[1-9]\d*$/.test(req.params.id)) return res.status(400).json({ message: 'ID dịch vụ không hợp lệ.' });
    const [rows] = await pool.execute(select + ' WHERE s.id = ?' + (isAdmin ? '' : " AND s.status = 'active' AND c.status = 'active'"), [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Dịch vụ không tồn tại hoặc đã ngừng cung cấp.' });
    res.json({ data: rows[0] });
  } catch (error) { next(error); }
}
async function removeImage(url) {
  if (!url || !/^\/uploads\/services\/[a-f0-9-]+\.(jpg|png|webp)$/.test(url)) return;
  try { await fs.unlink(path.join(uploadDirectory, path.basename(url))); }
  catch (error) { if (error.code !== 'ENOENT') console.error('Image cleanup failed:', error.code); }
}
async function save(req, res, next) {
  let newImage = null;
  let saved = false;
  try {
    const id = req.params.id;
    let old = {};
    if (id) {
      if (!/^[1-9]\d*$/.test(id)) return res.status(400).json({ message: 'ID dịch vụ không hợp lệ.' });
      const [rows] = await pool.execute('SELECT * FROM services WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy dịch vụ.' });
      old = rows[0];
    }
    const body = req.body || {};
    const data = {};
    for (const key of ['name','description','benefits','suitability_notes']) {
      const value = body[key] === undefined ? old[key] : body[key];
      if (value !== undefined && value !== null && typeof value !== 'string') return res.status(400).json({ message: 'Thông tin văn bản không hợp lệ.' });
      data[key] = typeof value === 'string' ? value.trim() : null;
    }
    data.category_id = String(body.category_id ?? old.category_id ?? '');
    data.price = String(body.price ?? old.price ?? '');
    data.duration_minutes = String(body.duration_minutes ?? old.duration_minutes ?? '');
    data.status = body.status ?? old.status ?? 'active';
    if (!data.name || data.name.length > 150 || !data.description
      || ['description','benefits','suitability_notes'].some(key => data[key] && Buffer.byteLength(data[key]) > 60000)
      || !/^[1-9]\d*$/.test(data.category_id) || !/^\d{1,12}$/.test(data.price)
      || !/^[1-9]\d*$/.test(data.duration_minutes) || Number(data.duration_minutes) > 65535
      || !['active','inactive'].includes(data.status)) {
      return res.status(400).json({ message: 'Vui lòng nhập tên, danh mục, mô tả, giá nguyên không âm và thời lượng từ 1 đến 65535 phút.' });
    }
    const [categories] = await pool.execute('SELECT id FROM service_categories WHERE id = ?', [data.category_id]);
    if (!categories.length) return res.status(400).json({ message: 'Danh mục không tồn tại.' });
    let imageUrl = old.image_url || null;
    if (req.file) {
      const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[req.file.mimetype];
      const filename = randomUUID() + '.' + extension;
      await fs.mkdir(uploadDirectory, { recursive: true });
      newImage = '/uploads/services/' + filename;
      await fs.writeFile(path.join(uploadDirectory, filename), req.file.buffer);
      imageUrl = newImage;
    }
    const values = [data.category_id, data.name, data.description, data.benefits, data.suitability_notes, data.price, data.duration_minutes, imageUrl, data.status];
    let resultId = id;
    if (id) await pool.execute('UPDATE services SET category_id=?, name=?, description=?, benefits=?, suitability_notes=?, price=?, duration_minutes=?, image_url=?, status=? WHERE id=?', [...values, id]);
    else {
      const [result] = await pool.execute('INSERT INTO services (category_id,name,description,benefits,suitability_notes,price,duration_minutes,image_url,status) VALUES (?,?,?,?,?,?,?,?,?)', values);
      resultId = result.insertId;
    }
    saved = true;
    if (newImage) await removeImage(old.image_url);
    const [rows] = await pool.execute(select + ' WHERE s.id = ?', [resultId]);
    res.status(id ? 200 : 201).json({ data: rows[0] });
  } catch (error) {
    if (newImage && !saved) await removeImage(newImage);
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Tên dịch vụ đã tồn tại trong danh mục này.' });
    if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ message: 'Danh mục không tồn tại.' });
    next(error);
  }
}
module.exports = {
  list: (req,res,next) => listServices(req,res,next,false),
  listAdmin: (req,res,next) => listServices(req,res,next,true),
  detail: (req,res,next) => detailService(req,res,next,false),
  detailAdmin: (req,res,next) => detailService(req,res,next,true),
  save,
};
