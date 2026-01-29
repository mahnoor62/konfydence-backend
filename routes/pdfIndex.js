const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

async function listPdfFiles() {
  // Allow overriding the PDFs directory via env (useful in deployments).
  // Default: ../web/public/pdfs relative to backend directory.
  const publicPdfsDir = process.env.PDFS_DIR
    ? path.resolve(process.env.PDFS_DIR)
    : path.join(process.cwd(), '..', 'web', 'public', 'pdfs');
  const files = [];
  async function walk(dir, base) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(base, full).split(path.sep).join('/');
      if (entry.isDirectory()) await walk(full, base);
      else if (entry.isFile()) files.push(rel);
    }
  }
  try {
    await walk(publicPdfsDir, publicPdfsDir);
  } catch (e) {
    return [];
  }
  return files;
}

router.get('/pdf-index', async (req, res) => {
  try {
    const files = await listPdfFiles();
    return res.json({ files });
  } catch (err) {
    console.error('Error listing pdf files:', err);
    return res.status(500).json({ files: [] });
  }
});

module.exports = router;

