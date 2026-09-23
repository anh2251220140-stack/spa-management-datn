const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { PayOS } = require('@payos/node');

// Chỉ báo tên biến bị thiếu, không đưa giá trị credentials vào lỗi hoặc log.
for (const name of ['PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY']) {
  if (!process.env[name] || !process.env[name].trim()) {
    throw new Error(`Missing payOS configuration: ${name}`);
  }
}

// CommonJS cache giữ một client dùng chung; constructor không gọi API payOS.
const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID,
  apiKey: process.env.PAYOS_API_KEY,
  checksumKey: process.env.PAYOS_CHECKSUM_KEY,
  logLevel: 'off',
});

module.exports = payos;
