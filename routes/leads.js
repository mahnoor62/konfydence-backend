const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const Lead = require('../models/Lead');
const Organization = require('../models/Organization');
const B2BLead = require('../models/B2BLead');
const EducationLead = require('../models/EducationLead');
const FreeTrial = require('../models/FreeTrial');
const User = require('../models/User');
const { sendOrganizationCreatedEmail, sendDemoApprovedEmail, sendDemoRejectedEmail } = require('../utils/emailService');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Function to generate strong random password
const generateStrongPassword = () => {
  const length = 12;
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';
  const allChars = uppercase + lowercase + numbers + symbols;
  
  let password = '';
  // Ensure at least one character from each category
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

const router = express.Router();

// Helper function to add timeline entry
const addTimelineEntry = async (lead, eventType, description, metadata = {}, createdBy = null) => {
  if (!lead.timeline) {
    lead.timeline = [];
  }
  lead.timeline.push({
    eventType,
    description,
    metadata,
    createdBy: createdBy || lead._id,
    createdAt: new Date()
  });
  // Keep only last 100 timeline entries
  if (lead.timeline.length > 100) {
    lead.timeline = lead.timeline.slice(-100);
  }
  await lead.save();
};

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
        { organizationName: { $regex: search, $options: 'i' } }
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
      .populate('notes.createdBy', 'name email')
      .populate('engagements.createdBy', 'name email')
      .populate('timeline.createdBy', 'name email')
      .sort({ 'timeline.createdAt': -1 });
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

    const oldStatus = lead.status;

    // Update fields
    Object.keys(req.body).forEach(key => {
      if (key !== '_id' && key !== 'createdAt' && key !== 'updatedAt' && key !== 'status') {
        lead[key] = req.body[key];
      }
    });

    // Handle status update separately to track changes
    if (req.body.status && req.body.status !== lead.status) {
      lead.status = req.body.status;
      // Add timeline entry for status change
      await addTimelineEntry(
        lead,
        'status_changed',
        `Status changed from ${oldStatus} to ${req.body.status}`,
        { oldStatus, newStatus: req.body.status },
        req.userId
      );
    } else if (req.body.status !== 'converted' && req.body.status !== 'lost') {
      // Auto-calculate status if not explicitly set to converted/lost
      const calculatedStatus = lead.calculateStatus();
      if (calculatedStatus !== lead.status) {
        const previousStatus = lead.status;
        lead.status = calculatedStatus;
        // Add timeline entry for auto status change
        await addTimelineEntry(
          lead,
          'status_changed',
          `Status auto-calculated: ${previousStatus} → ${calculatedStatus}`,
          { oldStatus: previousStatus, newStatus: calculatedStatus, autoCalculated: true },
          req.userId
        );
      }
    }

    // Update lastContactedAt if engagement fields are updated
    if (req.body.engagementCount || req.body.quoteRequested || req.body.demoCompleted) {
      lead.lastContactedAt = new Date();
    }

    await lead.save();

    const updatedLead = await Lead.findById(lead._id)
      .populate('convertedOrganizationId', 'name')
      .populate('linkedTrialIds', 'uniqueCode status')
      .populate('notes.createdBy', 'name email')
      .populate('timeline.createdBy', 'name email');

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

    // Add timeline entry
    await addTimelineEntry(
      lead,
      'note_added',
      `Note added: ${req.body.text.substring(0, 50)}${req.body.text.length > 50 ? '...' : ''}`,
      { noteText: req.body.text },
      req.userId || req.adminId
    );

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

    // Check if organization with same name already exists (case-insensitive)
    const escapedName = req.body.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const duplicateOrg = await Organization.findOne({ 
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') } 
    });
    if (duplicateOrg) {
      return res.status(400).json({ 
        error: `An organization with the name "${req.body.name.trim()}" already exists. Please use a different name.`
      });
    }

    // Get admin/user ID from request (could be adminId or userId)
    const Admin = require('../models/Admin');
    const User = require('../models/User');
    let ownerId = null;

    // Check if it's an admin token
    if (req.userId) {
      const admin = await Admin.findById(req.userId);
      if (admin) {
        ownerId = req.userId;
      } else {
        // Check if it's a regular user with admin role
        const user = await User.findById(req.userId);
        if (user && (user.role === 'admin' || user.role === 'super_admin')) {
          ownerId = req.userId;
        }
      }
    }

    // First, find or create user for primary contact (needed for ownerId)
    let user = await User.findOne({ email: req.body.primaryContact.email.toLowerCase() });
    
    // Generate strong random password
    const generatedPassword = generateStrongPassword();
    const passwordHash = await bcrypt.hash(generatedPassword, 10);
    
    if (!user) {
      // Create a new user for the lead's primary contact
      user = await User.create({
        name: req.body.primaryContact.name,
        email: req.body.primaryContact.email.toLowerCase(),
        passwordHash: passwordHash, // Set strong random password
        role: req.body.segment === 'B2B' ? 'b2b_user' : 'b2e_user', // Use req.body.segment instead of lead.segment
        isEmailVerified: true, // Set to true so no verification needed
        isActive: true
        // organizationId will be set after organization is created
      });
    } else {
      // User already exists - update password, email verification and role based on segment
      user.passwordHash = passwordHash; // Update with new strong password
      user.isEmailVerified = true;
      // Update role based on segment (B2B -> b2b_user, B2E -> b2e_user)
      user.role = req.body.segment === 'B2B' ? 'b2b_user' : 'b2e_user';
      await user.save();
    }

    // Now create organization WITH ownerId (required field)
    const organization = await Organization.create({
      name: req.body.name,
      type: req.body.type,
      segment: req.body.segment,
      customType: req.body.type === 'other' ? req.body.customType : undefined,
      primaryContact: {
        name: req.body.primaryContact.name,
        email: req.body.primaryContact.email
      },
      ownerId: user._id, // Set ownerId at creation time (required)
      status: 'prospect'
    });

    // Now update user with organizationId
    user.organizationId = organization._id;
    await user.save();

    // Update lead status
    lead.status = 'converted';
    lead.convertedOrganizationId = organization._id;
    lead.convertedAt = new Date();
    await lead.save();

    // Add timeline entry for conversion
    await addTimelineEntry(
      lead,
      'converted',
      `Lead converted to organization: ${organization.name}`,
      { organizationId: organization._id.toString(), organizationName: organization.name },
      req.userId
    );

    // Send email to user about organization creation with credentials
    try {
      await sendOrganizationCreatedEmail(user, organization, generatedPassword);
    } catch (emailError) {
      console.error('Error sending organization creation email:', emailError);
      // Don't fail the request if email fails
    }

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

// Get lead detail with full population (for detail page)
router.get('/unified/:id/detail', authenticateToken, checkPermission('leads'), async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('convertedOrganizationId', 'name type segment status')
      .populate('linkedTrialIds', 'uniqueCode status startDate endDate usedSeats maxSeats gamePlays')
      .populate('notes.createdBy', 'name email')
      .populate('engagements.createdBy', 'name email')
      .populate('timeline.createdBy', 'name email')
      .sort({ 'timeline.createdAt': -1 });
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    res.json(lead);
  } catch (error) {
    console.error('Error fetching lead detail:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update demo status
router.put('/unified/:id/demo-status', authenticateToken, checkPermission('leads'), [
  body('status').isIn(['none', 'requested', 'scheduled', 'completed', 'no_show']),
  body('scheduledAt').optional().isISO8601(),
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

    const oldStatus = lead.demoStatus || 'none';
    lead.demoStatus = req.body.status;
    
    // Update legacy fields for backward compatibility
    lead.demoRequested = req.body.status !== 'none';
    lead.demoCompleted = req.body.status === 'completed';
    
    if (req.body.status === 'scheduled' && req.body.scheduledAt) {
      lead.demoScheduledAt = new Date(req.body.scheduledAt);
    }
    if (req.body.status === 'completed') {
      lead.demoCompletedAt = new Date();
    }

    await lead.save();

    // Add timeline entry
    const statusLabels = {
      'none': 'Demo status reset',
      'requested': 'Demo requested',
      'scheduled': 'Demo scheduled',
      'completed': 'Demo completed',
      'no_show': 'Demo - No show'
    };
    await addTimelineEntry(
      lead,
      req.body.status === 'requested' ? 'demo_requested' :
      req.body.status === 'scheduled' ? 'demo_scheduled' :
      req.body.status === 'completed' ? 'demo_completed' :
      req.body.status === 'no_show' ? 'demo_no_show' : 'status_changed',
      statusLabels[req.body.status] || `Demo status changed from ${oldStatus} to ${req.body.status}`,
      { oldStatus, newStatus: req.body.status },
      req.userId
    );

    // Recalculate status
    lead.status = lead.calculateStatus();
    await lead.save();

    const updatedLead = await Lead.findById(req.params.id)
      .populate('notes.createdBy', 'name email')
      .populate('timeline.createdBy', 'name email');

    res.json(updatedLead);
  } catch (error) {
    console.error('Error updating demo status:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update demo approval (admin switch): when ON send approved email, when OFF send rejected email
router.put('/unified/:id/demo-approval', authenticateToken, checkPermission('leads'), [
  body('demoApproved').isBoolean(),
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

    const previousApproved = !!lead.demoApproved;
    const newApproved = !!req.body.demoApproved;
    lead.demoApproved = newApproved;
    await lead.save();

    // Send email based on new state
    if (newApproved) {
      await sendDemoApprovedEmail(lead);
      await addTimelineEntry(
        lead,
        'demo_requested',
        'Demo request approved; approval email sent to lead',
        { demoApproved: true },
        req.userId
      );
    } else {
      await sendDemoRejectedEmail(lead);
      await addTimelineEntry(
        lead,
        'status_changed',
        'Demo request not approved; rejection email sent to lead',
        { demoApproved: false },
        req.userId
      );
    }

    const updatedLead = await Lead.findById(req.params.id)
      .populate('notes.createdBy', 'name email')
      .populate('timeline.createdBy', 'name email');

    res.json(updatedLead);
  } catch (error) {
    console.error('Error updating demo approval:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update quote status
router.put('/unified/:id/quote-status', authenticateToken, checkPermission('leads'), [
  body('status').isIn(['none', 'requested', 'sent', 'accepted', 'lost']),
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

    const oldStatus = lead.quoteStatus || 'none';
    lead.quoteStatus = req.body.status;
    
    // Update legacy fields
    lead.quoteRequested = req.body.status !== 'none';
    
    if (req.body.status === 'requested') {
      lead.quoteRequestedAt = new Date();
    }
    if (req.body.status === 'sent') {
      lead.quoteSentAt = new Date();
    }
    if (req.body.status === 'accepted') {
      lead.quoteAcceptedAt = new Date();
    }

    await lead.save();

    // Add timeline entry
    const statusLabels = {
      'none': 'Quote status reset',
      'requested': 'Quote requested',
      'sent': 'Quote sent',
      'accepted': 'Quote accepted',
      'lost': 'Quote lost'
    };
    await addTimelineEntry(
      lead,
      req.body.status === 'requested' ? 'quote_requested' :
      req.body.status === 'sent' ? 'quote_sent' :
      req.body.status === 'accepted' ? 'quote_accepted' :
      req.body.status === 'lost' ? 'quote_lost' : 'status_changed',
      statusLabels[req.body.status] || `Quote status changed from ${oldStatus} to ${req.body.status}`,
      { oldStatus, newStatus: req.body.status },
      req.userId
    );

    // Recalculate status
    lead.status = lead.calculateStatus();
    await lead.save();

    const updatedLead = await Lead.findById(req.params.id)
      .populate('notes.createdBy', 'name email')
      .populate('timeline.createdBy', 'name email');

    res.json(updatedLead);
  } catch (error) {
    console.error('Error updating quote status:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Log engagement (Call/Email/Meeting/Other)
router.post('/unified/:id/engagement', authenticateToken, checkPermission('leads'), [
  body('type').isIn(['call', 'email', 'meeting', 'other']),
  body('summary').notEmpty().trim(),
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

    // Add engagement
    if (!lead.engagements) {
      lead.engagements = [];
    }
    lead.engagements.push({
      type: req.body.type,
      summary: req.body.summary,
      createdBy: req.userId,
      createdAt: new Date()
    });

    // Update engagement count
    lead.engagementCount = (lead.engagementCount || 0) + 1;
    lead.lastContactedAt = new Date();

    await lead.save();

    // Add timeline entry
    const typeLabels = {
      'call': 'Phone call',
      'email': 'Email sent',
      'meeting': 'Meeting',
      'other': 'Other interaction'
    };
    await addTimelineEntry(
      lead,
      'engagement_logged',
      `${typeLabels[req.body.type]}: ${req.body.summary}`,
      { type: req.body.type, summary: req.body.summary },
      req.userId
    );

    // Recalculate status
    lead.status = lead.calculateStatus();
    await lead.save();

    const updatedLead = await Lead.findById(req.params.id)
      .populate('engagements.createdBy', 'name email')
      .populate('timeline.createdBy', 'name email');

    res.json(updatedLead);
  } catch (error) {
    console.error('Error logging engagement:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update compliance tags
router.put('/unified/:id/compliance-tags', authenticateToken, checkPermission('leads'), [
  body('tags').isArray(),
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

    const validTags = [
      'NIS2', 'Security Awareness', 'Human Risk', 'Social Engineering',
      'Incident Response', 'Management Training', 'ISO 27001', 'Awareness', 'Leadership'
    ];
    
    const tags = req.body.tags.filter(tag => validTags.includes(tag));
    lead.complianceTags = tags;
    
    await lead.save();

    res.json(lead);
  } catch (error) {
    console.error('Error updating compliance tags:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update engagement evidence
router.put('/unified/:id/evidence', authenticateToken, checkPermission('leads'), [
  body('engagementEvidence').optional().isString(),
  body('evidenceDate').optional().isISO8601(),
  body('facilitator').optional().isString(),
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

    if (req.body.engagementEvidence !== undefined) {
      lead.engagementEvidence = req.body.engagementEvidence;
    }
    if (req.body.evidenceDate) {
      lead.evidenceDate = new Date(req.body.evidenceDate);
    }
    if (req.body.facilitator !== undefined) {
      lead.facilitator = req.body.facilitator;
    }

    await lead.save();

    res.json(lead);
  } catch (error) {
    console.error('Error updating evidence:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Export lead for audit (CSV)
router.get('/unified/:id/export', authenticateToken, checkPermission('leads'), async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate({
        path: 'convertedOrganizationId',
        populate: {
          path: 'customPackages',
          select: 'name description contract'
        }
      })
      .populate('notes.createdBy', 'name email')
      .populate('engagements.createdBy', 'name email')
      .populate('timeline.createdBy', 'name email');

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Convert to CSV format
    const csvRows = [];
    
    // Header row
    csvRows.push([
      'Field',
      'Value'
    ].join(','));

    // Lead Information
    csvRows.push(['Lead Name', `"${lead.name || ''}"`].join(','));
    csvRows.push(['Email', `"${lead.email || ''}"`].join(','));
    csvRows.push(['Organization Name', `"${lead.organizationName || ''}"`].join(','));
    csvRows.push(['Segment', `"${lead.segment || ''}"`].join(','));
    csvRows.push(['Source', `"${lead.source || ''}"`].join(','));
    csvRows.push(['Status', `"${lead.status || ''}"`].join(','));
    csvRows.push(['Created At', `"${lead.createdAt ? new Date(lead.createdAt).toISOString() : ''}"`].join(','));
    csvRows.push(['Updated At', `"${lead.updatedAt ? new Date(lead.updatedAt).toISOString() : ''}"`].join(','));

    // Demo Information
    csvRows.push(['', '']); // Empty row
    csvRows.push(['Demo Status', `"${lead.demoStatus || 'none'}"`].join(','));
    csvRows.push(['Demo Scheduled At', `"${lead.demoScheduledAt ? new Date(lead.demoScheduledAt).toISOString() : ''}"`].join(','));
    csvRows.push(['Demo Completed At', `"${lead.demoCompletedAt ? new Date(lead.demoCompletedAt).toISOString() : ''}"`].join(','));

    // Quote Information
    csvRows.push(['', '']); // Empty row
    csvRows.push(['Quote Status', `"${lead.quoteStatus || 'none'}"`].join(','));
    csvRows.push(['Quote Requested At', `"${lead.quoteRequestedAt ? new Date(lead.quoteRequestedAt).toISOString() : ''}"`].join(','));
    csvRows.push(['Quote Sent At', `"${lead.quoteSentAt ? new Date(lead.quoteSentAt).toISOString() : ''}"`].join(','));
    csvRows.push(['Quote Accepted At', `"${lead.quoteAcceptedAt ? new Date(lead.quoteAcceptedAt).toISOString() : ''}"`].join(','));

    // Compliance Information
    csvRows.push(['', '']); // Empty row
    csvRows.push(['Compliance Tags', `"${(lead.complianceTags || []).join('; ')}"`].join(','));
    csvRows.push(['Engagement Evidence', `"${(lead.engagementEvidence || '').replace(/"/g, '""')}"`].join(','));
    csvRows.push(['Evidence Date', `"${lead.evidenceDate ? new Date(lead.evidenceDate).toISOString() : ''}"`].join(','));
    csvRows.push(['Facilitator', `"${lead.facilitator || ''}"`].join(','));

    // Engagements
    if (lead.engagements && lead.engagements.length > 0) {
      csvRows.push(['', '']); // Empty row
      csvRows.push(['Engagements', '']); // Header
      lead.engagements.forEach((eng, idx) => {
        csvRows.push([
          `Engagement ${idx + 1}`,
          `"Type: ${eng.type || ''}; Summary: ${(eng.summary || '').replace(/"/g, '""')}; Date: ${eng.createdAt ? new Date(eng.createdAt).toISOString() : ''}; Created By: ${eng.createdBy?.name || ''}"`
        ].join(','));
      });
    }

    // Notes
    if (lead.notes && lead.notes.length > 0) {
      csvRows.push(['', '']); // Empty row
      csvRows.push(['Notes', '']); // Header
      lead.notes.forEach((note, idx) => {
        csvRows.push([
          `Note ${idx + 1}`,
          `"${(note.text || '').replace(/"/g, '""')}; Date: ${note.createdAt ? new Date(note.createdAt).toISOString() : ''}; Created By: ${note.createdBy?.name || ''}"`
        ].join(','));
      });
    }

    // Converted Organization Details
    if (lead.convertedOrganizationId) {
      csvRows.push(['', '']); // Empty row
      csvRows.push(['Organization Details', '']); // Header
      csvRows.push(['Organization Name', `"${lead.convertedOrganizationId.name || ''}"`].join(','));
      csvRows.push(['Organization Type', `"${lead.convertedOrganizationId.type || ''}"`].join(','));
      csvRows.push(['Organization Segment', `"${lead.convertedOrganizationId.segment || ''}"`].join(','));
      csvRows.push(['Organization Status', `"${lead.convertedOrganizationId.status || ''}"`].join(','));
      csvRows.push(['Unique Code', `"${lead.convertedOrganizationId.uniqueCode || ''}"`].join(','));
      
      // Primary Contact
      if (lead.convertedOrganizationId.primaryContact) {
        csvRows.push(['', '']); // Empty row
        csvRows.push(['Primary Contact', '']); // Header
        csvRows.push(['Contact Name', `"${lead.convertedOrganizationId.primaryContact.name || ''}"`].join(','));
        csvRows.push(['Contact Email', `"${lead.convertedOrganizationId.primaryContact.email || ''}"`].join(','));
      }
      
      // Active Packages
      if (lead.convertedOrganizationId.customPackages && lead.convertedOrganizationId.customPackages.length > 0) {
        const activePackages = lead.convertedOrganizationId.customPackages.filter(pkg => 
          pkg.contract && pkg.contract.status === 'active'
        );
        if (activePackages.length > 0) {
          csvRows.push(['', '']); // Empty row
          csvRows.push(['Active Packages', '']); // Header
          activePackages.forEach((pkg, idx) => {
            csvRows.push([
              `Package ${idx + 1}`,
              `"${pkg.name || ''} - ${pkg.description || ''}"`
            ].join(','));
          });
        }
      }
    }

    const csvContent = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="lead-${lead.name}-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting lead:', error);
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





