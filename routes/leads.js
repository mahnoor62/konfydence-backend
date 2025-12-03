const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const B2BLead = require('../models/B2BLead');
const EducationLead = require('../models/EducationLead');

const router = express.Router();

router.post(
  '/b2b',
  [
    body('name').notEmpty(),
    body('company').notEmpty(),
    body('email').isEmail()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const lead = await B2BLead.create(req.body);
      res.status(201).json(lead);
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.get('/b2b', authenticateToken, async (req, res) => {
  try {
    const leads = await B2BLead.find().sort({ createdAt: -1 });
    res.json(leads);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/b2b/:id', authenticateToken, async (req, res) => {
  try {
    const lead = await B2BLead.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/education',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('school').notEmpty().withMessage('School / Institution is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    // role and message are optional
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Ensure lead_type is set to 'b2e'
      const leadData = {
        ...req.body,
        lead_type: req.body.lead_type || 'b2e',
      };

      const lead = await EducationLead.create(leadData);
      res.status(201).json(lead);
    } catch (error) {
      console.error('Error creating education lead:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.get('/education', authenticateToken, async (req, res) => {
  try {
    const leads = await EducationLead.find().sort({ createdAt: -1 });
    res.json(leads);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/education/:id', authenticateToken, async (req, res) => {
  try {
    const lead = await EducationLead.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE B2B Lead
router.delete('/b2b/:id', authenticateToken, async (req, res) => {
  try {
    const lead = await B2BLead.findByIdAndDelete(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: 'B2B lead not found' });
    }
    res.json({ message: 'B2B lead deleted successfully' });
  } catch (error) {
    console.error('Error deleting B2B lead:', error);
    res.status(500).json({ error: 'Failed to delete B2B lead. Please try again.' });
  }
});

// DELETE Education Lead
router.delete('/education/:id', authenticateToken, async (req, res) => {
  try {
    const lead = await EducationLead.findByIdAndDelete(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: 'Education lead not found' });
    }
    res.json({ message: 'Education lead deleted successfully' });
  } catch (error) {
    console.error('Error deleting education lead:', error);
    res.status(500).json({ error: 'Failed to delete education lead. Please try again.' });
  }
});

module.exports = router;





