const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const jwtConfig = require('../config/jwt');

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validEmail(value) {
  return value.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPassword(value) {
  return typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72;
}

async function register(req, res, next) {
  const body = req.body || {};
  const email = normalizeEmail(body.email);
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (Object.prototype.hasOwnProperty.call(body, 'role')) {
    return res.status(400).json({ message: 'Role cannot be supplied during registration' });
  }
  if (!validEmail(email) || !validPassword(body.password) || !fullName || fullName.length > 100
      || !phone || phone.length > 20) {
    return res.status(400).json({ message: 'Valid email, password (8 characters minimum, 72 bytes maximum), full_name and phone are required' });
  }

  let connection;
  try {
    const passwordHash = await bcrypt.hash(body.password, 12);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [userResult] = await connection.execute(
      "INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, 'user', 'active')",
      [email, passwordHash]
    );
    const [customerResult] = await connection.execute(
      'INSERT INTO customers (user_id, full_name, phone) VALUES (?, ?, ?)',
      [userResult.insertId, fullName, phone]
    );
    await connection.commit();
    return res.status(201).json({
      message: 'Registration successful',
      data: {
        user: { id: userResult.insertId, email, role: 'user', status: 'active' },
        customer: { id: customerResult.insertId, user_id: userResult.insertId, full_name: fullName, phone },
      },
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (rollbackError) { return next(rollbackError); }
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Email already exists' });
    }
    next(error);
  } finally {
    if (connection) connection.release();
  }
}

async function login(req, res, next) {
  const body = req.body || {};
  const email = normalizeEmail(body.email);
  if (!validEmail(email) || typeof body.password !== 'string' || !body.password
      || Buffer.byteLength(body.password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Valid email and password are required' });
  }
  try {
    const [rows] = await pool.execute('SELECT id, email, password_hash, role, status FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (user.status !== 'active') return res.status(403).json({ message: 'Account is locked' });
    const token = jwt.sign({}, jwtConfig.secret, {
      subject: String(user.id), algorithm: 'HS256', expiresIn: jwtConfig.expiresIn,
    });
    return res.json({ data: {
      token, token_type: 'Bearer', expires_in: jwtConfig.expiresIn,
      user: { id: user.id, email: user.email, role: user.role, status: user.status },
    } });
  } catch (error) { next(error); }
}

async function getMe(req, res, next) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, full_name, phone FROM customers WHERE user_id = ?', [req.user.id]
    );
    res.json({ data: { user: req.user, customer: rows[0] || null } });
  } catch (error) { next(error); }
}

async function changePassword(req, res, next) {
  const { current_password: currentPassword, new_password: newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || !currentPassword
      || Buffer.byteLength(currentPassword, 'utf8') > 72 || !validPassword(newPassword)) {
    return res.status(400).json({ message: 'Current password and a valid new password are required' });
  }
  try {
    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length) return res.status(401).json({ message: 'Account not found' });
    const previousHash = rows[0].password_hash;
    if (!(await bcrypt.compare(currentPassword, previousHash))) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const [result] = await pool.execute(
      "UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ? AND status = 'active'",
      [passwordHash, req.user.id, previousHash]
    );
    if (!result.affectedRows) return res.status(409).json({ message: 'Account changed; please sign in again' });
    res.json({ message: 'Password changed successfully' });
  } catch (error) { next(error); }
}

module.exports = { register, login, getMe, changePassword };
