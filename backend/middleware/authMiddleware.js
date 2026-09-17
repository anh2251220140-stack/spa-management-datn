const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const jwtConfig = require('../config/jwt');

async function authMiddleware(req, res, next) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
  if (!match) {
    return res.status(401).json({ message: 'Bearer token is required' });
  }

  let payload;
  try {
    payload = jwt.verify(match[1], jwtConfig.secret, { algorithms: ['HS256'] });
    if (typeof payload !== 'object' || !/^\d+$/.test(payload.sub || '')) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id, email, role, status FROM users WHERE id = ?', [payload.sub]
    );
    if (!rows.length) return res.status(401).json({ message: 'Account not found' });
    if (rows[0].status !== 'active') {
      return res.status(403).json({ message: 'Account is locked' });
    }
    req.user = rows[0];
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = authMiddleware;
