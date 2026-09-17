require('./db');

const secret = process.env.JWT_SECRET;
const expiresIn = process.env.JWT_EXPIRES_IN;
if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
  throw new Error('JWT_SECRET must contain at least 32 bytes');
}
if (!expiresIn || !/^\d+[smhd]$/.test(expiresIn) || parseInt(expiresIn, 10) < 1) {
  throw new Error('JWT_EXPIRES_IN must use a positive duration such as 1h');
}

module.exports = { secret, expiresIn };
