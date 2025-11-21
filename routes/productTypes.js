const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const ProductType = require('../models/ProductType');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { active } = req.query;
    const query = {};
    
    if (active === 'true') {
      query.isActive = true;
    }

    const types = await ProductType.find(query).sort({ sortOrder: 1, name: 1 });
    res.json(types);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/',
  authenticateToken,
  [
    body('name').notEmpty().withMessage('Name is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name } = req.body;
      const slug = name.toLowerCase().replace(/\s+/g, '-');
      
      const existing = await ProductType.findOne({ $or: [{ name }, { slug }] });
      if (existing) {
        return res.status(400).json({ error: 'Product type with this name already exists' });
      }

      const count = await ProductType.countDocuments();
      const productType = await ProductType.create({
        name,
        slug,
        sortOrder: count,
        isActive: true,
      });

      res.status(201).json(productType);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Product type already exists' });
      }
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const productType = await ProductType.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!productType) {
      return res.status(404).json({ error: 'Product type not found' });
    }
    res.json(productType);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const productType = await ProductType.findByIdAndDelete(req.params.id);
    if (!productType) {
      return res.status(404).json({ error: 'Product type not found' });
    }
    res.json({ message: 'Product type deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

