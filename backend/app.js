const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const path = require('node:path');
const serviceCategoryRoutes = require('./routes/serviceCategoryRoutes');
const serviceRoutes = require('./routes/serviceRoutes');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', backend: 'running', database: 'connected' });
  } catch (error) {
    console.error('Database health check failed:', error.code || error.message);
    res.status(503).json({ status: 'error', backend: 'running', database: 'disconnected' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api', require('./routes/promotionRoutes'));
app.use('/api/profile', require('./routes/profileRoutes'));
app.use('/uploads/avatars', express.static(process.env.AVATAR_UPLOAD_DIR || path.join(__dirname, 'uploads', 'avatars'), {
  setHeaders(res) { res.setHeader('X-Content-Type-Options', 'nosniff'); },
}));
app.use('/api', require('./routes/appointmentRoutes'));
app.use('/api/admin', require('./routes/employeeRoutes'));
app.use('/api', serviceCategoryRoutes);
app.use('/api', serviceRoutes);
app.use('/uploads/services', express.static(process.env.SERVICE_UPLOAD_DIR || path.join(__dirname, 'uploads', 'services'), {
  setHeaders(res) { res.setHeader('X-Content-Type-Options', 'nosniff'); },
}));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(400).json({ message: 'Request body is too large' });
  }
  console.error('Request failed:', error.code || error.name);
  res.status(500).json({ message: 'Internal server error' });
});

module.exports = app;
