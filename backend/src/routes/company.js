const express = require('express');
const router = express.Router();
const pool = require('../db');
const upload = require('../middleware/upload');

// GET company settings
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM company_settings LIMIT 1');
  res.json(rows[0] || {});
});

// PUT update company settings
router.put('/', async (req, res) => {
  const {
    name, address, city, state, zip, country,
    phone, email, website, tax_id,
    invoice_prefix, footer_text, accent_color,
  } = req.body;

  const { rows } = await pool.query(
    `UPDATE company_settings
     SET name=$1, address=$2, city=$3, state=$4, zip=$5, country=$6,
         phone=$7, email=$8, website=$9, tax_id=$10,
         invoice_prefix=$11, footer_text=$12, accent_color=$13, updated_at=NOW()
     RETURNING *`,
    [name, address, city, state, zip, country, phone, email, website, tax_id, invoice_prefix, footer_text, accent_color || '#3b82f6'],
  );
  res.json(rows[0]);
});

// POST upload company logo
router.post('/logo', upload.single('logo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const logoPath = `/uploads/${req.file.filename}`;
  const { rows } = await pool.query(
    'UPDATE company_settings SET logo_path=$1, updated_at=NOW() RETURNING *',
    [logoPath],
  );
  res.json(rows[0]);
});

// DELETE company logo
router.delete('/logo', async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE company_settings SET logo_path=NULL, updated_at=NOW() RETURNING *',
  );
  res.json(rows[0]);
});

module.exports = router;
