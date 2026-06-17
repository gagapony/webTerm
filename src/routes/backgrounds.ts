import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { config } from '../config';

const router = Router();

// Create database connection for backgrounds table
const db = new Database(config.database.path);
db.pragma('journal_mode = WAL');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../data/backgrounds');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `${timestamp}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
    }
  }
});

// Create backgrounds table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS backgrounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT,
    mime_type TEXT,
    size INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// GET /api/backgrounds - List all backgrounds
router.get('/', (req: Request, res: Response) => {
  try {
    const backgrounds = db.prepare('SELECT * FROM backgrounds ORDER BY created_at DESC').all();
    res.json(backgrounds);
  } catch (error) {
    console.error('Error fetching backgrounds:', error);
    res.status(500).json({ error: 'Failed to fetch backgrounds' });
  }
});

// POST /api/backgrounds/upload - Upload a new background
router.post('/upload', upload.single('image'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { filename, originalname, mimetype, size } = req.file;

    const result = db.prepare(
      'INSERT INTO backgrounds (filename, original_name, mime_type, size) VALUES (?, ?, ?, ?)'
    ).run(filename, originalname, mimetype, size);

    res.json({
      id: result.lastInsertRowid,
      filename,
      original_name: originalname,
      url: `/backgrounds/${filename}`
    });
  } catch (error) {
    console.error('Error uploading background:', error);
    res.status(500).json({ error: 'Failed to upload background' });
  }
});

// DELETE /api/backgrounds/:id - Delete a background
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get the background record
    const background = db.prepare('SELECT * FROM backgrounds WHERE id = ?').get(id) as any;

    if (!background) {
      return res.status(404).json({ error: 'Background not found' });
    }

    // Delete the file
    const filePath = path.join(__dirname, '../../data/backgrounds', background.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete the record
    db.prepare('DELETE FROM backgrounds WHERE id = ?').run(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting background:', error);
    res.status(500).json({ error: 'Failed to delete background' });
  }
});

export default router;
