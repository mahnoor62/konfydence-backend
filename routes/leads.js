const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const Lead = require('../models/Lead');
const Organization = require('../models/Organization');
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

      // Create in old model for backward compatibility
      const lead = await B2BLead.create(req.body);
      
      // Also create unified Lead record
      try {
        await Lead.create({
          name: req.body.name,
          email: req.body.email,
          phone: req.body.phone || '',
          organizationName: req.body.company,
          segment: 'B2B',
          source: 'b2b_form',
          status: 'new'
        });
      } catch (unifiedError) {
        console.error('Error creating unified lead:', unifiedError);
        // Don't fail the request if unified lead creation fails
      }
      
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

      // Create in old model for backward compatibility
      const lead = await EducationLead.create(leadData);
      
      // Also create unified Lead record
      try {
        await Lead.create({
          name: req.body.name,
          email: req.body.email,
          phone: req.body.phone || '',
          organizationName: req.body.school,
          segment: 'B2E',
          source: 'b2e_form',
          status: 'new'
        });
      } catch (unifiedError) {
        console.error('Error creating unified lead:', unifiedError);
        // Don't fail the request if unified lead creation fails
      }
      
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

// Unified Lead endpoints
router.get('/unified', authenticateToken, checkPermission('leads'), async (req, res) => {
  try {
    const { status, segment, source, search } = req.query;
    const query = {};

    if (status) query.status = status;
    if (segment) query.segment = segment;
    if (source) query.source = source;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { organizationName: { $regex: search, $options: 'i' } }
      ];
    }

    const leads = await Lead.find(query)
      // .populate('linkedDemoIds') // Demo model removed
      .populate('convertedOrganizationId', 'name')
      .sort({ createdAt: -1 });
    res.json(leads);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/unified/:id', authenticateToken, checkPermission('leads'), async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      // .populate('linkedDemoIds') // Demo model removed
      .populate('convertedOrganizationId')
      .populate('notes.createdBy', 'name email');
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json(lead);
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/unified',
  [
    body('name').notEmpty().trim(),
    body('email').isEmail().normalizeEmail(),
    body('segment').isIn(['B2B', 'B2E', 'other']),
    body('source').isIn(['b2b_form', 'b2e_form', 'contact_form', 'manual'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const lead = await Lead.create(req.body);
      res.status(201).json(lead);
    } catch (error) {
      console.error('Error creating lead:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put('/unified/:id', authenticateToken, checkPermission('leads'), async (req, res) => {
  try {
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json(lead);
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/unified/:id/notes', authenticateToken, checkPermission('leads'), [
  body('text').notEmpty().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          notes: {
            text: req.body.text,
            createdBy: req.userId
          }
        }
      },
      { new: true }
    ).populate('notes.createdBy', 'name email');

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json(lead);
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/unified/:id/convert', authenticateToken, checkPermission('leads'), [
  body('name').notEmpty().trim(),
  body('type').isIn(['company', 'bank', 'school', 'govt', 'other']),
  body('segment').isIn(['B2B', 'B2E']),
  body('primaryContact.name').notEmpty(),
  body('primaryContact.email').isEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const organization = await Organization.create({
      name: req.body.name,
      type: req.body.type,
      segment: req.body.segment,
      primaryContact: {
        name: req.body.primaryContact.name,
        email: req.body.primaryContact.email,
        phone: req.body.primaryContact.phone || lead.phone,
        jobTitle: req.body.primaryContact.jobTitle
      },
      status: 'prospect'
    });

    lead.status = 'converted';
    lead.convertedOrganizationId = organization._id;
    await lead.save();

    res.status(201).json({
      message: 'Lead converted to organization',
      organization,
      lead
    });
  } catch (error) {
    console.error('Error converting lead:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/unified/:id', authenticateToken, checkPermission('leads'), async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;





