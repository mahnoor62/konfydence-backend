const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const Lead = require('../models/Lead');
const Organization = require('../models/Organization');
const B2BLead = require('../models/B2BLead');
const EducationLead = require('../models/EducationLead');
const FreeTrial = require('../models/FreeTrial');

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
        const leadData = {
          name: req.body.name,
          email: req.body.email,
          phone: req.body.phone || '',
          organizationName: req.body.company,
          segment: 'B2B',
          source: 'b2b_form',
          status: 'new',
          engagementCount: 0, // Start with 0
          demoRequested: true // B2B form = demo request (will make it warm)
        };
        
        const lead = await Lead.create(leadData);
        // Auto-calculate status (will be warm because demoRequested = true)
        lead.status = lead.calculateStatus();
        await lead.save();
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
        const leadData = {
          name: req.body.name,
          email: req.body.email,
          phone: req.body.phone || '',
          organizationName: req.body.school,
          segment: 'B2E',
          source: 'b2e_form',
          status: 'new',
          engagementCount: 0, // Start with 0
          demoRequested: true // Education form = demo request (will make it warm)
        };
        
        const lead = await Lead.create(leadData);
        // Auto-calculate status (will be warm because demoRequested = true)
        lead.status = lead.calculateStatus();
        await lead.save();
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

    if (status && status !== 'all') query.status = status;
    if (segment && segment !== 'all') query.segment = segment;
    if (source && source !== 'all') query.source = source;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { organizationName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const leads = await Lead.find(query)
      .populate('convertedOrganizationId', 'name')
      .populate('linkedTrialIds', 'uniqueCode status endDate usedSeats maxSeats')
      .populate('notes.createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    // Auto-calculate status for each lead
    const leadsWithCalculatedStatus = leads.map(lead => {
      const calculatedStatus = lead.calculateStatus();
      if (calculatedStatus !== lead.status && lead.status !== 'converted' && lead.status !== 'lost') {
        // Auto-update status if different (but don't save yet - let admin decide)
        lead.status = calculatedStatus;
      }
      return lead;
    });

    res.json(leadsWithCalculatedStatus);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/unified/:id', authenticateToken, checkPermission('leads'), async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('convertedOrganizationId')
      .populate('linkedTrialIds', 'uniqueCode status startDate endDate usedSeats maxSeats gamePlays')
      .populate('notes.createdBy', 'name email');
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    // Auto-calculate and update status
    const calculatedStatus = lead.calculateStatus();
    if (calculatedStatus !== lead.status && lead.status !== 'converted' && lead.status !== 'lost') {
      lead.status = calculatedStatus;
      await lead.save();
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
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Update fields
    Object.keys(req.body).forEach(key => {
      if (key !== '_id' && key !== 'createdAt' && key !== 'updatedAt') {
        lead[key] = req.body[key];
      }
    });

    // Auto-calculate status if not explicitly set to converted/lost
    if (req.body.status !== 'converted' && req.body.status !== 'lost') {
      const calculatedStatus = lead.calculateStatus();
      lead.status = calculatedStatus;
    }

    // Update lastContactedAt if engagement fields are updated
    if (req.body.engagementCount || req.body.quoteRequested || req.body.demoCompleted) {
      lead.lastContactedAt = new Date();
    }

    await lead.save();

    const updatedLead = await Lead.findById(lead._id)
      .populate('convertedOrganizationId', 'name')
      .populate('linkedTrialIds', 'uniqueCode status')
      .populate('notes.createdBy', 'name email');

    res.json(updatedLead);
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

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Add note
    lead.notes.push({
      text: req.body.text,
      createdBy: req.userId || req.adminId
    });

    // Increment engagement count
    lead.engagementCount = (lead.engagementCount || 0) + 1;
    lead.lastContactedAt = new Date();

    // Auto-calculate status
    const calculatedStatus = lead.calculateStatus();
    if (calculatedStatus !== lead.status && lead.status !== 'converted' && lead.status !== 'lost') {
      lead.status = calculatedStatus;
    }

    await lead.save();

    const updatedLead = await Lead.findById(lead._id)
      .populate('notes.createdBy', 'name email')
      .populate('linkedTrialIds', 'uniqueCode status');

    res.json(updatedLead);
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
        jobTitle: req.body.primaryContact.jobTitle || lead.jobTitle
      },
      status: 'prospect'
    });

    lead.status = 'converted';
    lead.convertedOrganizationId = organization._id;
    lead.convertedAt = new Date();
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

// Track demo request
router.post('/unified/:id/demo-request', authenticateToken, checkPermission('leads'), async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    lead.demoRequested = true;
    lead.engagementCount = (lead.engagementCount || 0) + 1;
    lead.lastContactedAt = new Date();

    // Auto-calculate status
    const calculatedStatus = lead.calculateStatus();
    if (calculatedStatus !== lead.status && lead.status !== 'converted' && lead.status !== 'lost') {
      lead.status = calculatedStatus;
    }

    await lead.save();
    res.json(lead);
  } catch (error) {
    console.error('Error tracking demo request:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Track demo completion and link trial
router.post('/unified/:id/demo-complete', authenticateToken, checkPermission('leads'), [
  body('trialId').optional().isMongoId()
], async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    lead.demoCompleted = true;
    lead.demoRequested = true;
    lead.engagementCount = (lead.engagementCount || 0) + 1;
    lead.lastContactedAt = new Date();

    // Link trial if provided
    if (req.body.trialId) {
      const trial = await FreeTrial.findById(req.body.trialId);
      if (trial && !lead.linkedTrialIds.includes(trial._id)) {
        lead.linkedTrialIds.push(trial._id);
      }
    }

    // Auto-calculate status (demo completed = hot lead)
    lead.status = lead.calculateStatus();

    await lead.save();

    const updatedLead = await Lead.findById(lead._id)
      .populate('linkedTrialIds', 'uniqueCode status endDate');

    res.json(updatedLead);
  } catch (error) {
    console.error('Error tracking demo completion:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Track quote request
router.post('/unified/:id/quote-request', authenticateToken, checkPermission('leads'), async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    lead.quoteRequested = true;
    lead.quoteRequestedAt = new Date();
    lead.engagementCount = (lead.engagementCount || 0) + 1;
    lead.lastContactedAt = new Date();

    // Quote request = hot lead
    lead.status = lead.calculateStatus();

    await lead.save();
    res.json(lead);
  } catch (error) {
    console.error('Error tracking quote request:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Link trial to lead
router.post('/unified/:id/link-trial', authenticateToken, checkPermission('leads'), [
  body('trialId').isMongoId()
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

    const trial = await FreeTrial.findById(req.body.trialId);
    if (!trial) {
      return res.status(404).json({ error: 'Trial not found' });
    }

    if (!lead.linkedTrialIds.includes(trial._id)) {
      lead.linkedTrialIds.push(trial._id);
      lead.engagementCount = (lead.engagementCount || 0) + 1;
      await lead.save();
    }

    const updatedLead = await Lead.findById(lead._id)
      .populate('linkedTrialIds', 'uniqueCode status endDate usedSeats maxSeats');

    res.json(updatedLead);
  } catch (error) {
    console.error('Error linking trial:', error);
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





