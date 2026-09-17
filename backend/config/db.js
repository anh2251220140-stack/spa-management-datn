const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mysql = require('mysql2/promise');

const requiredVariables = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
for (const name of requiredVariables) {
  if (process.env[name] === undefined || (name !== 'DB_PASSWORD' && !process.env[name].trim())) {
    throw new Error(`Missing environment variable: ${name}`);
  }
}

const databasePort = Number(process.env.DB_PORT);
if (!Number.isInteger(databasePort) || databasePort < 1 || databasePort > 65535) {
  throw new Error('DB_PORT must be a valid port number');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: databasePort,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 20,
  connectTimeout: 5000,
});

module.exports = pool;
