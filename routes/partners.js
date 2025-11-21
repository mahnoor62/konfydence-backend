const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const PartnerLogo = require('../models/PartnerLogo');


const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    const query = { isActive: true };
    if (type) {
      query.type = type;
    }
    const partners = await PartnerLogo.find(query).sort({ createdAt: -1 });
    res.json(partners);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/',
  authenticateToken,
  [
    body('name').notEmpty().withMessage('Partner name is required'),
    body('logoUrl').notEmpty().withMessage('Logo URL is required'),
    body('type').isIn(['press', 'partner', 'event']).withMessage('Partner type must be press, partner, or event')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => err.msg).join(', ');
        return res.status(400).json({ error: errorMessages, errors: errors.array() });
      }

      const partner = await PartnerLogo.create(req.body);
      res.status(201).json(partner);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Partner logo with this name already exists' });
      }
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map((err) => err.message).join(', ');
        return res.status(400).json({ error: validationErrors });
      }
      console.error('Error creating partner logo:', error);
      res.status(500).json({ error: 'Failed to create partner logo. Please try again.' });
    }
  }
);

router.put(
  '/:id',
  authenticateToken,
  [
    body('name').optional().notEmpty().withMessage('Partner name cannot be empty'),
    body('logoUrl').optional().notEmpty().withMessage('Logo URL cannot be empty'),
    body('type').optional().isIn(['press', 'partner', 'event']).withMessage('Partner type must be press, partner, or event')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => err.msg).join(', ');
        return res.status(400).json({ error: errorMessages, errors: errors.array() });
      }

      const partner = await PartnerLogo.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );
      if (!partner) {
        return res.status(404).json({ error: 'Partner logo not found' });
      }
      res.json(partner);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Partner logo with this name already exists' });
      }
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map((err) => err.message).join(', ');
        return res.status(400).json({ error: validationErrors });
      }
      console.error('Error updating partner logo:', error);
      res.status(500).json({ error: 'Failed to update partner logo. Please try again.' });
    }
  }
);

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const partner = await PartnerLogo.findByIdAndDelete(req.params.id);
    if (!partner) {
      return res.status(404).json({ error: 'Partner logo not found' });
    }
    res.json({ message: 'Partner logo deleted successfully' });
  } catch (error) {
    console.error('Error deleting partner logo:', error);
    res.status(500).json({ error: 'Failed to delete partner logo. Please try again.' });
  }
});

module.exports = router;



