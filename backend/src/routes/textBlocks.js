const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET all text blocks
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM text_blocks ORDER BY title ASC');
  res.json(rows);
});

// POST create
router.post('/', async (req, res) => {
  const { title, content, content_de } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'title and content are required' });
  const { rows } = await pool.query(
    'INSERT INTO text_blocks (title, content, content_de) VALUES ($1, $2, $3) RETURNING *',
    [title.trim(), content.trim(), (content_de || '').trim()],
  );
  res.status(201).json(rows[0]);
});

// PUT update
router.put('/:id', async (req, res) => {
  const { title, content, content_de } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'title and content are required' });
  const { rows } = await pool.query(
    'UPDATE text_blocks SET title=$1, content=$2, content_de=$3, updated_at=NOW() WHERE id=$4 RETURNING *',
    [title.trim(), content.trim(), (content_de || '').trim(), req.params.id],
  );
  if (!rows.length) return res.status(404).json({ error: 'Text block not found' });
  res.json(rows[0]);
});

// PATCH toggle default
router.patch('/:id/default', async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE text_blocks SET is_default = NOT is_default, updated_at=NOW() WHERE id=$1 RETURNING *',
    [req.params.id],
  );
  if (!rows.length) return res.status(404).json({ error: 'Text block not found' });
  res.json(rows[0]);
});

// DELETE
router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM text_blocks WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
