const pool = require('../config/db');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const directory = process.env.AVATAR_UPLOAD_DIR || path.join(__dirname, '..', 'uploads', 'avatars');

async function removeAvatar(url) {
  if (!/^\/uploads\/avatars\/[a-f0-9-]+\.(jpg|png|webp)$/.test(url || '')) return;
  await fs.unlink(path.join(directory, path.basename(url))).catch(error => {
    if (error.code !== 'ENOENT') console.error('Avatar cleanup failed:', error.code);
  });
}

exports.getProfile = async (req, res, next) => {
  try {
    const [[profile]] = await pool.execute(
      'SELECT id, full_name, phone, avatar_url FROM customers WHERE user_id = ?', [req.user.id]
    );
    if (!profile) return res.status(404).json({ message: 'Không tìm thấy hồ sơ khách hàng.' });
    res.json({ data: { ...profile, email: req.user.email } });
  } catch (error) { next(error); }
};

exports.updateProfile = async (req, res, next) => {
  const body = req.body || {};
  if (Object.keys(body).some(key => !['full_name', 'phone'].includes(key))) {
    return res.status(400).json({ message: 'Chỉ được cập nhật họ tên, số điện thoại và ảnh đại diện của bạn.' });
  }
  const updates = {};
  for (const [key, max] of [['full_name', 100], ['phone', 20]]) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'string' || !body[key].trim() || body[key].trim().length > max) {
        return res.status(400).json({ message: `${key === 'full_name' ? 'Họ tên' : 'Số điện thoại'} không hợp lệ (tối đa ${max} ký tự).` });
      }
      updates[key] = body[key].trim();
    }
  }
  if (!Object.keys(updates).length && !req.file) return res.status(400).json({ message: 'Chưa có thông tin cập nhật.' });
  let connection;
  let newAvatar;
  let committed = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    // Khóa đúng hồ sơ hiện tại để hai lần thay ảnh không để lại ảnh cũ.
    const [[profile]] = await connection.execute('SELECT id, full_name, phone, avatar_url FROM customers WHERE user_id = ? FOR UPDATE', [req.user.id]);
    if (!profile) {
      await connection.rollback();
      return res.status(404).json({ message: 'Không tìm thấy hồ sơ khách hàng.' });
    }
    if (req.file) {
      const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[req.file.mimetype];
      const filename = `${randomUUID()}.${extension}`;
      newAvatar = `/uploads/avatars/${filename}`;
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, filename), req.file.buffer, { flag: 'wx' });
    }
    const updated = { ...profile, ...updates, avatar_url: newAvatar || profile.avatar_url };
    await connection.execute('UPDATE customers SET full_name = ?, phone = ?, avatar_url = ? WHERE id = ?', [updated.full_name, updated.phone, updated.avatar_url, profile.id]);
    await connection.commit();
    committed = true;
    if (newAvatar) await removeAvatar(profile.avatar_url);
    res.json({ message: 'Cập nhật hồ sơ thành công.', data: { ...updated, email: req.user.email } });
  } catch (error) {
    if (connection && !committed) await connection.rollback().catch(() => {});
    if (newAvatar && !committed) await removeAvatar(newAvatar);
    next(error);
  } finally { if (connection) connection.release(); }
};
