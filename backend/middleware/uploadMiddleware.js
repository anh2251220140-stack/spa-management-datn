const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 12, fieldSize: 100000 },
  fileFilter(req, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      const error = new Error('Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.');
      error.status = 400;
      return callback(error);
    }
    callback(null, true);
  },
}).single('image');
module.exports = (req, res, next) => upload(req, res, (error) => {
  if (error) return res.status(400).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'Ảnh không được vượt quá 5 MB.' : error.status === 400 ? error.message : 'Dữ liệu tải ảnh không hợp lệ (tối đa một ảnh, 5 MB).' });
  if (req.file) {
    const b = req.file.buffer;
    const type = req.file.mimetype;
    const valid = (type === 'image/jpeg' && b.length > 3 && b[0] === 255 && b[1] === 216 && b[2] === 255)
      || (type === 'image/png' && b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
      || (type === 'image/webp' && b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP');
    if (!valid) return res.status(400).json({ message: 'Nội dung file không khớp định dạng ảnh.' });
  }
  next();
});
