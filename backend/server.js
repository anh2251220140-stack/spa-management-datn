// Kiểm tra payOS khi khởi động server; test import app.js không phụ thuộc payOS.
require('./config/payos');
const app = require('./app');
const pool = require('./config/db');

const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid port number');
}

const server = app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/api/health`);
});

server.on('error', async (error) => {
  console.error('Server failed:', error.code || error.message);
  await pool.end();
  process.exitCode = 1;
});

function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exitCode = 0;
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
