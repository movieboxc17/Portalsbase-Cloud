/**
 * Files API router
 *
 * Endpoints:
 * - GET  /api/files?path=<relative>          -> list files & folders in storage dir or subdir
 * - GET  /api/files/preview?path=<relative>  -> stream file inline (preview)
 * - GET  /api/files/download?path=<relative> -> download file as attachment
 *
 * Security:
 * - Ensures path is inside STORAGE_DIR (prevents traversal)
 *
 * Requires 'mime-types' package (npm i mime-types)
 */
const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const mime = require('mime-types');

const router = express.Router();

const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage');

function resolveSafe(relPath) {
  // normalize and join, then ensure it starts with STORAGE_DIR
  const safeRel = relPath ? String(relPath) : '';
  const target = path.normalize(path.join(STORAGE_DIR, safeRel));
  if (!target.startsWith(path.normalize(STORAGE_DIR))) {
    throw new Error('Path traversal detected');
  }
  return target;
}

router.get('/', async (req, res) => {
  const rel = req.query.path || '';
  try {
    const target = resolveSafe(rel);
    const entries = await fsp.readdir(target, { withFileTypes: true });
    const list = await Promise.all(entries.map(async (e) => {
      const full = path.join(target, e.name);
      if (e.isDirectory()) {
        return {
          name: e.name,
          path: path.join(rel, e.name).replace(/\\/g, '/'),
          type: 'directory'
        };
      } else {
        const st = await fsp.stat(full);
        const mimeType = mime.lookup(full) || 'application/octet-stream';
        return {
          name: e.name,
          path: path.join(rel, e.name).replace(/\\/g, '/'),
          type: 'file',
          size: st.size,
          mtime: st.mtime,
          mime: mimeType
        };
      }
    }));
    // sort directories first
    list.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'directory' ? -1 : 1;
    });
    res.json({ path: rel, list });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

router.get('/preview', (req, res) => {
  const rel = req.query.path;
  if (!rel) return res.status(400).json({ error: 'Missing path' });
  let target;
  try {
    target = resolveSafe(rel);
  } catch (err) {
    return res.status(400).json({ error: String(err) });
  }
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) return res.status(404).json({ error: 'File not found' });
    const mt = mime.lookup(target) || 'application/octet-stream';
    res.setHeader('Content-Type', mt);
    res.setHeader('Content-Length', stat.size);
    // inline preview
    const stream = fs.createReadStream(target);
    stream.on('error', () => res.status(500).end());
    stream.pipe(res);
  });
});

router.get('/download', (req, res) => {
  const rel = req.query.path;
  if (!rel) return res.status(400).json({ error: 'Missing path' });
  let target;
  try {
    target = resolveSafe(rel);
  } catch (err) {
    return res.status(400).json({ error: String(err) });
  }
  res.download(target, err => {
    if (err) res.status(404).json({ error: 'File not found or could not download' });
  });
});

module.exports = router;
