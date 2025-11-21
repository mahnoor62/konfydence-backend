const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const BlogCategory = require('../models/BlogCategory');

const router = express.Router();

const defaultCategories = [
  { name: 'Insight', slug: 'insight', isActive: true, sortOrder: 1 },
  { name: 'Technique', slug: 'technique', isActive: true, sortOrder: 2 },
  { name: 'Checklist', slug: 'checklist', isActive: true, sortOrder: 3 },
  { name: 'Guide', slug: 'guide', isActive: true, sortOrder: 4 },
  { name: 'Template', slug: 'template', isActive: true, sortOrder: 5 },
  { name: 'Reference', slug: 'reference', isActive: true, sortOrder: 6 },
];

async function ensureSeedCategories() {
  for (const category of defaultCategories) {
    const existing = await BlogCategory.findOne({ slug: category.slug });
    if (!existing) {
      await BlogCategory.create(category);
    }
  }
}

router.get('/', async (req, res) => {
  try {
    await ensureSeedCategories();
    const { active } = req.query;
    const query = {};
    
    if (active === 'true') {
      query.isActive = true;
    }

    const categories = await BlogCategory.find(query).sort({ sortOrder: 1, name: 1 });
    res.json(categories);
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
      
      const existing = await BlogCategory.findOne({ $or: [{ name }, { slug }] });
      if (existing) {
        return res.status(400).json({ error: 'Blog category with this name already exists' });
      }

      const count = await BlogCategory.countDocuments();
      const category = await BlogCategory.create({
        name,
        slug,
        sortOrder: count,
        isActive: true,
      });

      res.status(201).json(category);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Blog category already exists' });
      }
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const category = await BlogCategory.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!category) {
      return res.status(404).json({ error: 'Blog category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const category = await BlogCategory.findByIdAndDelete(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Blog category not found' });
    }
    res.json({ message: 'Blog category deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

