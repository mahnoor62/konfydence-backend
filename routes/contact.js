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
      'media-press'
    ]),
    body('message').optional()
  ], // Validation updated
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Log received topic value for debugging
      console.log('📥 Received contact form data:', {
        topic: req.body.topic,
        name: req.body.name,
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
        
        // Company/Business topics → B2B
        'b2b_demo': 'B2B',
        'comasy': 'B2B',
        'nis2-audit': 'B2B',
        
        // All other topics → 'other'
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
        
        // Determine source based on topic
        // B2B topics (comasy, b2b_demo, nis2-audit) should use 'b2b_form'
        // B2E topics (education, education-youth-pack) should use 'b2e_form'
        // All others use 'contact_form'
        let source = 'contact_form';
        if (['comasy', 'b2b_demo', 'nis2-audit'].includes(req.body.topic)) {
          source = 'b2b_form';
        } else if (['education', 'education-youth-pack'].includes(req.body.topic)) {
          source = 'b2e_form';
        }

        console.log('📝 Creating lead from contact form:', {
          topic: req.body.topic,
          mappedSegment: segment,
          source: source,
          name: req.body.name,
          email: req.body.email
        });

        // Ensure segment is valid (required field in Lead schema)
        if (!segment) {
          console.error('❌ Invalid segment for topic:', req.body.topic);
          throw new Error(`Invalid segment mapping for topic: ${req.body.topic}`);
        }

          const leadData = {
            name: req.body.name,
            email: req.body.email,
          organizationName: req.body.organization || req.body.company || '',
          topic: req.body.topic, // Store original topic for reference
            segment: segment,
            source: source,
            status: 'new',
          engagementCount: 0,
          demoRequested: ['b2b_demo', 'comasy', 'nis2-audit'].includes(req.body.topic), // Mark as demo requested if B2B/Comasy related
          teamSize: req.body.teamSize || '', // Save team size if provided (B2B)
          studentStaffSize: req.body.studentStaffSize || '', // Save student/staff size if provided (B2E)
          message: req.body.message || '' // Save original message
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
          segment: lead.segment,
          source: lead.source,
          topic: req.body.topic,
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
