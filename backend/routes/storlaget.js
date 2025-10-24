/**
 * GET /api/storage/usage
 *
 * Response:
 * { total: number, used: number, free: number, percent: number }
 *
 * Requires:
 * - Node >= 12
 * - Put files under STORAGE_DIR (env) or default ./storage
 * - Optional env MAX_STORAGE_BYTES (defaults to 10 GB)
 */
const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage');
const MAX_STORAGE_BYTES = Number(process.env.MAX_STORAGE_BYTES) || 10 * 1024 * 1024 * 1024; // 10GB

async function getDirectorySize(dir) {
  let total = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        total += await getDirectorySize(full);
      } else if (e.isFile()) {
        try {
          const st = await fs.stat(full);
          total += st.size;
        } catch (err) {
          // ignore unreadable files
        }
      }
    }
  } catch (err) {
    // if dir doesn't exist or can't be read, treat as 0 used
  }
  return total;
}

router.get('/usage', async (req, res) => {
  try {
    const used = await getDirectorySize(STORAGE_DIR);
    const total = MAX_STORAGE_BYTES;
    const free = Math.max(0, total - used);
    const percent = total > 0 ? Number(((used / total) * 100).toFixed(2)) : 0;
    res.json({ total, used, free, percent });
  } catch (err) {
    res.status(500).json({ error: 'Could not compute storage usage', details: String(err) });
  }
});

module.exports = router;
