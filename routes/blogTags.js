const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const BlogTag = require('../models/BlogTag');

const router = express.Router();

const defaultTags = [
  { name: 'Security', slug: 'security', isActive: true, sortOrder: 1 },
  { name: 'Awareness', slug: 'awareness', isActive: true, sortOrder: 2 },
  { name: 'Training', slug: 'training', isActive: true, sortOrder: 3 },
  { name: 'Compliance', slug: 'compliance', isActive: true, sortOrder: 4 },
  { name: 'Phishing', slug: 'phishing', isActive: true, sortOrder: 5 },
  { name: 'Social Engineering', slug: 'social-engineering', isActive: true, sortOrder: 6 },
];

async function ensureSeedTags() {
  for (const tag of defaultTags) {
    const existing = await BlogTag.findOne({ slug: tag.slug });
    if (!existing) {
      await BlogTag.create(tag);
    }
  }
}

router.get('/', async (req, res) => {
  try {
    await ensureSeedTags();
    const { active } = req.query;
    const query = {};
    
    if (active === 'true') {
      query.isActive = true;
    }

    const tags = await BlogTag.find(query).sort({ sortOrder: 1, name: 1 });
    res.json(tags);
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
      
      const existing = await BlogTag.findOne({ $or: [{ name }, { slug }] });
      if (existing) {
        return res.status(400).json({ error: 'Blog tag with this name already exists' });
      }

      const count = await BlogTag.countDocuments();
      const tag = await BlogTag.create({
        name,
        slug,
        sortOrder: count,
        isActive: true,
      });

      res.status(201).json(tag);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Blog tag already exists' });
      }
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const tag = await BlogTag.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!tag) {
      return res.status(404).json({ error: 'Blog tag not found' });
    }
    res.json(tag);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const tag = await BlogTag.findByIdAndDelete(req.params.id);
    if (!tag) {
      return res.status(404).json({ error: 'Blog tag not found' });
    }
    res.json({ message: 'Blog tag deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

