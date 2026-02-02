const express = require('express');
const { body, validationResult } = require('express-validator');
const Subscriber = require('../models/Subscriber');

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

      const { email, subscriptionType = 'general', source = 'other' } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      // Check if email already exists for this subscription type
      const existingSubscriber = await Subscriber.findOne({ 
        email: normalizedEmail,
        subscriptionType 
      });
      
      if (existingSubscriber) {
        const messages = {
          'latest-news': 'You have already subscribed to latest news.',
          'weekly-insights': 'You have already subscribed to weekly insights.',
          'general': 'You have already subscribed to our newsletter.',
          'waitlist': 'You are already on the waitlist.',
        };

        // If the email is already registered for this subscription type, return a 400
        // so the frontend can show a clear "already registered" error instead of treating it as success.
        return res.status(400).json({
          success: false,
          message: messages[subscriptionType] || 'This email has already been registered.',
          duplicate: true,
          data: existingSubscriber,
        });
      }

      // Create new subscriber subscription
      const subscriber = await Subscriber.create({
        email: normalizedEmail,
        subscriptionType,
        source: source,
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
        data: subscriber,
      });
    } catch (error) {
      console.error('Subscriber subscription error:', error);
      
      // Handle duplicate key error (MongoDB unique constraint)
      if (error.code === 11000) {
        const messages = {
          'latest-news': 'You have already subscribed to latest news.',
          'weekly-insights': 'You have already subscribed to weekly insights.',
          'general': 'You have already subscribed to our newsletter.',
          'waitlist': 'You are already on the waitlist. We\'ll notify you when we launch on Kickstarter.',
        };

        // Check if error is from compound index (email + subscriptionType)
        const keyPattern = error.keyPattern || {};
        const subscriptionTypeFromError = keyPattern.subscriptionType ? req.body.subscriptionType : 'general';

        // Try to find existing subscription to return it
        try {
          const existing = await Subscriber.findOne({
            email: req.body.email?.toLowerCase().trim(),
            subscriptionType: subscriptionTypeFromError
          });

          return res.status(400).json({
            success: false,
            message: messages[subscriptionTypeFromError] || 'This email has already been registered.',
            duplicate: true,
            data: existing,
          });
        } catch (findError) {
          return res.status(400).json({
            success: false,
            message: messages[subscriptionTypeFromError] || 'This email has already been registered.',
            duplicate: true,
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
        Subscriber.find(query)
          .sort({ subscribedAt: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        Subscriber.countDocuments(query),
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
      console.error('Subscribers list error:', error);
      return res.status(500).json({
        success: false,
        message: 'An error occurred while fetching subscribers.',
      });
    }
  }
);

router.delete(
  '/:id',
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Subscriber ID is required.',
        });
      }

      const subscriber = await Subscriber.findByIdAndDelete(id);

      if (!subscriber) {
        return res.status(404).json({
          success: false,
          message: 'Subscriber not found.',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Subscriber deleted successfully.',
        data: subscriber,
      });
    } catch (error) {
      console.error('Delete subscriber error:', error);
      return res.status(500).json({
        success: false,
        message: 'An error occurred while deleting the subscriber.',
      });
    }
  }
);

module.exports = router;

