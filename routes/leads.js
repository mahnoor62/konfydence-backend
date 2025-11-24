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
    body('schoolName').notEmpty(),
    body('contactName').notEmpty(),
    body('email').isEmail(),
    body('role').notEmpty(),
    body('cityCountry').notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const lead = await EducationLead.create(req.body);
      res.status(201).json(lead);
    } catch (error) {
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

module.exports = router;





