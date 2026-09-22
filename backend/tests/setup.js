const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

// Nạp cấu hình riêng trước khi app.js được import, không dùng .env development.
const result = dotenv.config({ path: path.join(__dirname, '..', '.env.test'), override: true, quiet: true });
if (result.error) throw new Error('Create backend/.env.test before running tests');
const config = result.parsed;
for (const key of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET', 'JWT_EXPIRES_IN']) {
  if (config[key] === undefined || (key !== 'DB_PASSWORD' && !config[key].trim())) {
    throw new Error(`Missing test configuration: ${key}`);
  }
}
if (config.DB_NAME !== 'spa_management_test') {
  throw new Error('Tests are restricted to spa_management_test');
}
process.env.NODE_ENV = 'test';

beforeAll(async () => {
  const connection = await mysql.createConnection({
    host: config.DB_HOST,
    port: Number(config.DB_PORT),
    user: config.DB_USER,
    password: config.DB_PASSWORD,
  });
  try {
    // Chỉ tạo database test và bảng còn thiếu; không DROP/TRUNCATE bảng.
    await connection.query('CREATE DATABASE IF NOT EXISTS spa_management_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await connection.changeUser({ database: 'spa_management_test' });
    const [[database]] = await connection.query('SELECT DATABASE() AS name');
    if (database.name !== 'spa_management_test') throw new Error('Unsafe test database');
    const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'schema.sql'), 'utf8');
    for (const table of ['users', 'customers', 'service_categories', 'services', 'employees', 'employee_services', 'employee_schedules', 'appointments']) {
      const [existing] = await connection.execute(
        'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        ['spa_management_test', table]
      );
      if (!existing.length) {
        const statement = schema.match(new RegExp(`CREATE TABLE ${table} \\([\\s\\S]*?;`));
        if (!statement) throw new Error(`Missing table definition: ${table}`);
        await connection.query(statement[0]);
      }
    }
    const [avatarColumns] = await connection.execute(
      'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      ['spa_management_test', 'customers', 'avatar_url']
    );
    if (!avatarColumns.length) await connection.query('ALTER TABLE customers ADD COLUMN avatar_url VARCHAR(255) NULL AFTER phone');
  } finally {
    await connection.end();
  }
});
