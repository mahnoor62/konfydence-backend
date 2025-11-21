const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.\-_]/g, '');
    cb(null, `${timestamp}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const router = express.Router();

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = `/uploads/${req.file.filename}`;
  const absoluteUrl = `${req.protocol}://${req.get('host')}${filePath}`;

  res.status(201).json({
    url: absoluteUrl,
    path: filePath,
    filename: req.file.filename,
    size: req.file.size,
    mimeType: req.file.mimetype,
  });
});

module.exports = router;



