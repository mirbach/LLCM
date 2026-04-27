const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET all customers
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM customers ORDER BY name ASC',
  );
  res.json(rows);
});

// GET single customer
router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM customers WHERE id=$1',
    [req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Customer not found' });
  res.json(rows[0]);
});

// POST create customer
router.post('/', async (req, res) => {
  const { name, email, phone, address, city, state, zip, country, notes, currency, contact_person, title } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  const { rows } = await pool.query(
    `INSERT INTO customers (name, email, phone, address, city, state, zip, country, notes, currency, customer_number, contact_person, title)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
             'K-' || LPAD(nextval('customer_number_seq')::text, 6, '0'),$11,$12)
     RETURNING *`,
    [name, email, phone, address, city, state, zip, country, notes, currency || 'USD', contact_person || '', title || ''],
  );
  res.status(201).json(rows[0]);
});

// PUT update customer
router.put('/:id', async (req, res) => {
  const { name, email, phone, address, city, state, zip, country, notes, currency, contact_person, title } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  const { rows } = await pool.query(
    `UPDATE customers
     SET name=$1, email=$2, phone=$3, address=$4, city=$5,
         state=$6, zip=$7, country=$8, notes=$9, currency=$10, contact_person=$11, title=$12, updated_at=NOW()
     WHERE id=$13
     RETURNING *`,
    [name, email, phone, address, city, state, zip, country, notes, currency || 'USD', contact_person || '', title || '', req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Customer not found' });
  res.json(rows[0]);
});

// DELETE customer
router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM customers WHERE id=$1', [req.params.id]);
  res.status(204).send();
});

module.exports = router;
