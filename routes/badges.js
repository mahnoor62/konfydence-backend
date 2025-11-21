const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const Badge = require('../models/Badge');

const router = express.Router();

const defaultBadges = [
  { name: 'New', slug: 'new', isActive: true, sortOrder: 1 },
  { name: 'Best Seller', slug: 'best-seller', isActive: true, sortOrder: 2 },
  { name: 'Featured', slug: 'featured', isActive: true, sortOrder: 3 },
  { name: 'Family', slug: 'family', isActive: true, sortOrder: 4 },
  { name: 'Schools', slug: 'schools', isActive: true, sortOrder: 5 },
  { name: 'B2B', slug: 'b2b', isActive: true, sortOrder: 6 },
];

async function ensureSeedBadges() {
  for (const badge of defaultBadges) {
    const existing = await Badge.findOne({ slug: badge.slug });
    if (!existing) {
      await Badge.create(badge);
    }
  }
}

router.get('/', async (req, res) => {
  try {
    await ensureSeedBadges();
    const { active } = req.query;
    const query = {};
    
    if (active === 'true') {
      query.isActive = true;
    }

    const badges = await Badge.find(query).sort({ sortOrder: 1, name: 1 });
    res.json(badges);
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
      
      const existing = await Badge.findOne({ $or: [{ name }, { slug }] });
      if (existing) {
        return res.status(400).json({ error: 'Badge with this name already exists' });
      }

      const count = await Badge.countDocuments();
      const badge = await Badge.create({
        name,
        slug,
        sortOrder: count,
        isActive: true,
      });

      res.status(201).json(badge);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Badge already exists' });
      }
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const badge = await Badge.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!badge) {
      return res.status(404).json({ error: 'Badge not found' });
    }
    res.json(badge);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const badge = await Badge.findByIdAndDelete(req.params.id);
    if (!badge) {
      return res.status(404).json({ error: 'Badge not found' });
    }
    res.json({ message: 'Badge deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

