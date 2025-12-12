const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const ContactMessage = require('../models/ContactMessage');
const Lead = require('../models/Lead');

const router = express.Router();

router.post(
  '/',
  [
    body('name').notEmpty(),
    body('email').isEmail(),
    body('topic').isIn(['b2b_demo', 'b2c_question', 'education', 'other']),
    body('message').notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Create contact message
      const message = await ContactMessage.create(req.body);
      
      // Also create unified Lead record if it's a B2B demo or education inquiry
      if (req.body.topic === 'b2b_demo' || req.body.topic === 'education') {
        try {
          const segment = req.body.topic === 'b2b_demo' ? 'B2B' : 'B2E';
          const source = req.body.topic === 'b2b_demo' ? 'b2b_form' : 'b2e_form';
          
          await Lead.create({
            name: req.body.name,
            email: req.body.email,
            phone: req.body.phone || '',
            organizationName: req.body.company || '',
            segment: segment,
            source: source,
            status: 'new'
          });
        } catch (unifiedError) {
          console.error('Error creating unified lead from contact:', unifiedError);
          // Don't fail the request if unified lead creation fails
        }
      } else {
        // For other contact topics, create as 'other' segment
        try {
          await Lead.create({
            name: req.body.name,
            email: req.body.email,
            phone: req.body.phone || '',
            organizationName: req.body.company || '',
            segment: 'other',
            source: 'contact_form',
            status: 'new'
          });
        } catch (unifiedError) {
          console.error('Error creating unified lead from contact:', unifiedError);
          // Don't fail the request if unified lead creation fails
        }
      }
      
      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.get('/', authenticateToken, async (req, res) => {
  try {
    const messages = await ContactMessage.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const message = await ContactMessage.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    res.json(message);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE Contact Message
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const message = await ContactMessage.findByIdAndDelete(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Contact message not found' });
    }
    res.json({ message: 'Contact message deleted successfully' });
  } catch (error) {
    console.error('Error deleting contact message:', error);
    res.status(500).json({ error: 'Failed to delete contact message. Please try again.' });
  }
});

module.exports = router;





