const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const ContactMessage = require('../models/ContactMessage');
const Lead = require('../models/Lead');

const router = express.Router();

router.post(
  '/',
  [
    body('firstName').notEmpty().withMessage('First name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
    body('email').isEmail(),
    body('topic').isIn([
      'b2b_demo',
      'b2c_question',
      'education',
      'other',
      'scam-survival-kit',
      'education-youth-pack',
      'comasy',
      'nis2-audit',
      'partnerships',
      'media-press',
      'demo-families',
      'demo-schools',
      'demo-businesses',
      'CoMaSi'
    ]),
    body('message').optional()
  ], // Validation updated
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Combine firstName and lastName for full name
      const fullName = `${req.body.firstName} ${req.body.lastName}`.trim();

      // Log received topic value for debugging
      console.log('📥 Received contact form data:', {
        topic: req.body.topic,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        name: fullName,
        email: req.body.email,
        fullBody: req.body
      });

      // Check if a lead with this email already exists (before creating contact message)
      const existingLead = await Lead.findOne({ email: req.body.email.toLowerCase().trim() });
      
      if (existingLead) {
        console.log('⚠️ Duplicate contact attempt:', {
          email: req.body.email,
          existingLeadId: existingLead._id,
          existingSource: existingLead.source
        });
        return res.status(400).json({ 
          error: 'You have already contacted us. Our team will get back to you soon.',
          duplicate: true
        });
      }

      // Create contact message
      const message = await ContactMessage.create(req.body);

      console.log('✅ Contact message created with topic:', message.topic);

      // Map topic to segment based on what user selected
      // Educational topics → B2E
      // Company/Business topics → B2B
      // All other topics → 'other'
      const topicToSegmentMap = {
        // Educational Institute topics → B2E
        'education': 'B2E',
        'education-youth-pack': 'B2E',
        'demo-schools': 'B2E',
        
        // Company/Business topics → B2B
        'b2b_demo': 'B2B',
        'comasy': 'B2B',
        'CoMaSi': 'B2B',
        'nis2-audit': 'B2B',
        'demo-businesses': 'B2B',
        
        // Family/Consumer topics → 'other'
        'demo-families': 'other',
        'scam-survival-kit': 'other',
        'b2c_question': 'other',
        'partnerships': 'other',
        'media-press': 'other',
        'other': 'other'
      };

      // Always create unified Lead record for all contact form submissions
      try {
        // Get segment from topic mapping, with fallback to 'other' if topic not found
        const segment = topicToSegmentMap[req.body.topic] || 'other';
        
        // Determine source based on form origin
        // If submitted from contact page (/contact), always use 'contact_form'
        // If submitted from CoMaSi page, use 'b2b_form'
        // If submitted from Education page, use 'b2e_form'
        // Check for formSource in request body, if not present, default to 'contact_form'
        let source = req.body.formSource || 'contact_form';
        
        // If formSource is not provided, determine from topic (for backward compatibility)
        // But contact page should always send formSource='contact_form'
        if (!req.body.formSource) {
          // Default to contact_form for contact page submissions
          source = 'contact_form';
        }

        console.log('📝 Creating lead from contact form:', {
          topic: req.body.topic, // Original topic from form
          mappedSegment: segment, // Segment mapped from topic
          source: source,
          firstName: req.body.firstName,
          lastName: req.body.lastName,
          name: fullName,
          email: req.body.email
        });
        
        // Verify topic and segment mapping for contact form
        console.log('✅ Topic & Segment Verification:', {
          selectedTopic: req.body.topic,
          mappedSegment: segment,
          topicToSegmentMap: topicToSegmentMap[req.body.topic] || 'not found in map'
        });

        // Ensure segment is valid (required field in Lead schema)
        if (!segment) {
          console.error('❌ Invalid segment for topic:', req.body.topic);
          throw new Error(`Invalid segment mapping for topic: ${req.body.topic}`);
        }

          const leadData = {
            name: fullName, // Combine firstName and lastName for Lead model
            email: req.body.email,
          organizationName: req.body.organization || req.body.company || '',
          topic: req.body.topic, // Store original topic exactly as received from form
            segment: segment, // Segment mapped from topic
            source: source,
            status: 'new',
          engagementCount: 0,
          demoRequested: ['b2b_demo', 'comasy', 'nis2-audit', 'CoMaSi', 'demo-families', 'demo-schools', 'demo-businesses'].includes(req.body.topic), // Mark as demo requested if demo topic
          teamSize: req.body.teamSize || '', // Save team size if provided (B2B)
          studentStaffSize: req.body.studentStaffSize || '', // Save student/staff size if provided (B2E)
          message: req.body.message || '', // Save original message
          // Address fields for demo topics (from contact form)
          address: req.body.address || '',
          city: req.body.city || '',
          state: req.body.state || '',
          country: req.body.country || '',
          phone: req.body.phone || '',
          department: req.body.department || '',
          position: req.body.position || '',
          website: req.body.website || ''
        };

        console.log('📦 Lead data to be created:', leadData);

          const lead = await Lead.create(leadData);
          // Auto-calculate status (will be warm if demoRequested, otherwise new)
          lead.status = lead.calculateStatus();
          await lead.save();
        
        console.log('✅ Unified lead created from contact form:', {
          leadId: lead._id,
          name: lead.name,
          email: lead.email,
          topic: lead.topic, // Saved topic (should match req.body.topic)
          segment: lead.segment, // Saved segment (mapped from topic)
          source: lead.source,
          organizationName: lead.organizationName
        });
        } catch (unifiedError) {
        console.error('❌ Error creating unified lead from contact:', unifiedError);
        console.error('Error details:', unifiedError.message, unifiedError.stack);
          // Check if error is duplicate email (MongoDB duplicate key error)
          if (unifiedError.code === 11000 || unifiedError.message.includes('duplicate')) {
            return res.status(400).json({ 
              error: 'You have already contacted us. Our team will get back to you soon.',
              duplicate: true
            });
          }
          // Don't fail the request if unified lead creation fails for other reasons
      }

      console.log('✅ Contact message created:', message._id);
      res.status(201).json(message);
    } catch (error) {
      console.error('❌ Error in contact POST route:', error);
      res.status(500).json({ error: error.message || 'Server error', details: error.toString() });
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
    res.status(500).json({ error: error.message });
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
