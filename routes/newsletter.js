const express = require('express');
const { body, validationResult } = require('express-validator');
const Newsletter = require('../models/Newsletter');

const router = express.Router();

router.post(
  '/subscribe',
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
    body('subscriptionType')
      .optional()
      .isIn(['latest-news', 'weekly-insights', 'general', 'waitlist'])
      .withMessage('Invalid subscription type'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email address',
          errors: errors.array(),
        });
      }

      const { email, subscriptionType = 'general' } = req.body;

      // Check if email already exists for this subscription type
      const existingSubscriber = await Newsletter.findOne({ 
        email: email.toLowerCase().trim(),
        subscriptionType 
      });
      
      if (existingSubscriber) {
        const messages = {
          'latest-news': 'You have already subscribed to latest news.',
          'weekly-insights': 'You have already subscribed to weekly insights.',
          'general': 'You have already subscribed to our newsletter.',
          'waitlist': 'You are already on the waitlist. We\'ll notify you when we launch on Kickstarter.',
        };
        
        return res.status(200).json({
          success: true,
          message: messages[subscriptionType] || 'You have already subscribed.',
          data: existingSubscriber,
        });
      }

      // Create new newsletter subscription
      const newsletter = await Newsletter.create({
        email: email.toLowerCase().trim(),
        subscriptionType,
      });

      const successMessages = {
        'latest-news': 'Successfully subscribed to latest news!',
        'weekly-insights': 'Successfully subscribed to weekly insights!',
        'general': 'Successfully subscribed to newsletter!',
        'waitlist': 'Thank you! You\'re on the waitlist. We\'ll notify you when we launch on Kickstarter.',
      };

      return res.status(201).json({
        success: true,
        message: successMessages[subscriptionType] || 'Successfully subscribed!',
        data: newsletter,
      });
    } catch (error) {
      console.error('Newsletter subscription error:', error);
      
      // Handle duplicate key error (MongoDB unique constraint)
      if (error.code === 11000) {
        const messages = {
          'latest-news': 'You have already subscribed to latest news.',
          'weekly-insights': 'You have already subscribed to weekly insights.',
          'general': 'You have already subscribed to our newsletter.',
          'waitlist': 'You are already on the waitlist. We\'ll notify you when we launch on Kickstarter.',
        };
        
        // Check if error is from compound index (email + subscriptionType) or old email_1 index
        const keyPattern = error.keyPattern || {};
        const subscriptionTypeFromError = keyPattern.subscriptionType ? req.body.subscriptionType : 'general';
        
        // Try to find existing subscription to return it
        try {
          const existing = await Newsletter.findOne({ 
            email: req.body.email?.toLowerCase().trim(),
            subscriptionType: subscriptionTypeFromError 
          });
          
          return res.status(200).json({
            success: true,
            message: messages[subscriptionTypeFromError] || 'You have already subscribed.',
            data: existing,
          });
        } catch (findError) {
          return res.status(200).json({
            success: true,
            message: messages[subscriptionTypeFromError] || 'You have already subscribed.',
          });
        }
      }

      return res.status(500).json({
        success: false,
        message: 'An error occurred while subscribing. Please try again later.',
      });
    }
  }
);

router.get(
  '/list',
  async (req, res) => {
    try {
      const { page = 1, limit = 50, subscriptionType } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Build query based on subscriptionType filter
      const query = {};
      if (subscriptionType && subscriptionType !== 'all') {
        query.subscriptionType = subscriptionType;
      }

      const [subscribers, total] = await Promise.all([
        Newsletter.find(query)
          .sort({ subscribedAt: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        Newsletter.countDocuments(query),
      ]);

      return res.status(200).json({
        success: true,
        data: subscribers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error('Newsletter list error:', error);
      return res.status(500).json({
        success: false,
        message: 'An error occurred while fetching newsletter subscribers.',
      });
    }
  }
);

module.exports = router;

