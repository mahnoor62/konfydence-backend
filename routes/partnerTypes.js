const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const PartnerType = require('../models/PartnerType');
const PartnerLogo = require('../models/PartnerLogo');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const { active } = req.query;
    const query = {};
    if (active === 'true') {
      query.isActive = true;
    }

    const types = await PartnerType.find(query).sort({ sortOrder: 1, name: 1 });
    res.json(types);
  } catch (error) {
    console.error('Error fetching partner types:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/',
  authenticateToken,
  [body('name').notEmpty().withMessage('Name is required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name } = req.body;
      const slug = name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

      const existing = await PartnerType.findOne({
        $or: [{ name }, { slug }],
      });
      if (existing) {
        return res
          .status(400)
          .json({ error: 'Partner type with this name already exists' });
      }

      const count = await PartnerType.countDocuments();
      const type = await PartnerType.create({
        name,
        slug,
        sortOrder: count,
        isActive: true,
      });
      res.status(201).json(type);
    } catch (error) {
      if (error.code === 11000) {
        return res
          .status(400)
          .json({ error: 'Partner type with this name already exists' });
      }
      console.error('Error creating partner type:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const update = { ...req.body };
    if (update.name) {
      update.slug = update.name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
    }
    const type = await PartnerType.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );
    if (!type) {
      return res.status(404).json({ error: 'Partner type not found' });
    }
    res.json(type);
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ error: 'Partner type with this name already exists' });
    }
    console.error('Error updating partner type:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const type = await PartnerType.findByIdAndDelete(req.params.id);
    if (!type) {
      return res.status(404).json({ error: 'Partner type not found' });
    }
    res.json({ message: 'Partner type deleted', deletedSlug: type.slug });
  } catch (error) {
    console.error('Error deleting partner type:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

