const express = require('express');
const { body, validationResult } = require('express-validator');
const CardRegistration = require('../models/CardRegistration');
const Card = require('../models/Card');
const User = require('../models/User');

const router = express.Router();

// Generate reference code format: 4573-DTE2-R232
function generateReferenceCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const generateSegment = () => {
    let segment = '';
    for (let i = 0; i < 4; i++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return segment;
  };
  return `${generateSegment()}-${generateSegment()}-${generateSegment()}`;
}

// Public route - Register a card with reference code
router.post(
  '/register',
  [
    body('referenceCode').notEmpty().trim().withMessage('Reference code is required'),
    body('email').optional().isEmail().withMessage('Valid email is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { referenceCode, email, source = 'etsy' } = req.body;
      const normalizedCode = referenceCode.trim().toUpperCase().replace(/\s+/g, '');

      // Check if code is already registered
      const existing = await CardRegistration.findOne({ referenceCode: normalizedCode });
      if (existing) {
        return res.status(400).json({ error: 'This reference code has already been registered' });
      }

      // Find or create user if email provided
      let user = null;
      if (email) {
        user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
          // Create user if doesn't exist
          user = await User.create({
            email: email.toLowerCase(),
            username: email.split('@')[0],
            role: 'user'
          });
        }
      } else {
        return res.status(400).json({ error: 'Email is required for registration' });
      }

      // Create registration
      const registration = await CardRegistration.create({
        referenceCode: normalizedCode,
        userId: user._id,
        source: source,
        freeAccessMonths: source === 'etsy' ? 2 : 0
      });

      const populated = await CardRegistration.findById(registration._id)
        .populate('userId', 'email username');

      res.status(201).json({
        message: 'Card registered successfully! You have received 2 months free digital access.',
        registration: populated
      });
    } catch (error) {
      console.error('Error registering card:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Admin route - Generate reference codes for cards
router.post(
  '/generate-codes',
  require('../middleware/auth').authenticateToken,
  require('../middleware/rbac').checkPermission('cards'),
  [
    body('cardIds').isArray().notEmpty().withMessage('Card IDs are required'),
    body('quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be a positive number'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { cardIds, quantity = 1 } = req.body;
      const codes = [];

      for (const cardId of cardIds) {
        for (let i = 0; i < quantity; i++) {
          const code = generateReferenceCode();
          codes.push({
            cardId,
            referenceCode: code
          });
        }
      }

      res.json({ codes });
    } catch (error) {
      console.error('Error generating codes:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get user's registered cards
router.get('/user/:userId', async (req, res) => {
  try {
    const registrations = await CardRegistration.find({ userId: req.params.userId })
      .populate('userId', 'email username')
      .sort({ registeredAt: -1 });
    res.json(registrations);
  } catch (error) {
    console.error('Error fetching registrations:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;



























