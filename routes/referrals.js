const express = require('express');
const { body, validationResult } = require('express-validator');
const Referral = require('../models/Referral');
const User = require('../models/User');
const CardRegistration = require('../models/CardRegistration');

const router = express.Router();

// Public route - Create referral
router.post(
  '/create',
  [
    body('referrerUserId').notEmpty().withMessage('Referrer user ID is required'),
    body('referralCode').optional().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { referrerUserId, referralCode } = req.body;

      const referrer = await User.findById(referrerUserId);
      if (!referrer) {
        return res.status(404).json({ error: 'Referrer user not found' });
      }

      const referral = await Referral.create({
        referrerUserId,
        referralCode: referralCode || undefined
      });

      res.status(201).json({
        message: 'Referral code created',
        referralCode: referral.referralCode
      });
    } catch (error) {
      console.error('Error creating referral:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Public route - Use referral code
router.post(
  '/use',
  [
    body('referralCode').notEmpty().trim().withMessage('Referral code is required'),
    body('referredEmail').isEmail().withMessage('Valid email is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { referralCode, referredEmail } = req.body;
      const normalizedCode = referralCode.trim().toUpperCase();

      // Find referral
      const referral = await Referral.findOne({ 
        referralCode: normalizedCode,
        status: 'pending'
      }).populate('referrerUserId');

      if (!referral) {
        return res.status(404).json({ error: 'Invalid or expired referral code' });
      }

      // Find or create referred user
      let referredUser = await User.findOne({ email: referredEmail.toLowerCase() });
      if (!referredUser) {
        referredUser = await User.create({
          email: referredEmail.toLowerCase(),
          username: referredEmail.split('@')[0],
          role: 'user'
        });
      }

      // Check if user already used this referral
      if (referral.referredUserId && referral.referredUserId.toString() === referredUser._id.toString()) {
        return res.status(400).json({ error: 'You have already used this referral code' });
      }

      // Update referral
      referral.referredUserId = referredUser._id;
      referral.status = 'completed';
      
      // Grant free access to both users
      const now = new Date();
      const referrerExpiry = new Date(now);
      referrerExpiry.setMonth(referrerExpiry.getMonth() + 1);
      const referredExpiry = new Date(now);
      referredExpiry.setMonth(referredExpiry.getMonth() + 1);

      referral.referrerAccessExpiresAt = referrerExpiry;
      referral.referredAccessExpiresAt = referredExpiry;
      referral.referrerRewardGranted = true;
      referral.referredRewardGranted = true;

      await referral.save();

      res.json({
        message: 'Referral code applied successfully! Both you and your referrer have received 1 month free digital access.',
        referral
      });
    } catch (error) {
      console.error('Error using referral:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get user's referrals
router.get('/user/:userId', async (req, res) => {
  try {
    const referrals = await Referral.find({
      $or: [
        { referrerUserId: req.params.userId },
        { referredUserId: req.params.userId }
      ]
    })
      .populate('referrerUserId', 'email username')
      .populate('referredUserId', 'email username')
      .sort({ createdAt: -1 });
    res.json(referrals);
  } catch (error) {
    console.error('Error fetching referrals:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;




















