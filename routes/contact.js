const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const ContactMessage = require('../models/ContactMessage');
const Lead = require('../models/Lead');
const { sendDemoRequestConfirmationEmail } = require('../utils/emailService');

const router = express.Router();

router.post(
  '/',
  [
    body('firstName').notEmpty().withMessage('First name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Please provide a valid email address'),
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
      'CoMaSi',
      'ambassador-program'
    ]).withMessage('Please select a valid topic from the dropdown'),
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

      const normalizedEmail = req.body.email.toLowerCase().trim();
      const demoTopics = ['demo-schools', 'demo-businesses', 'demo-families'];
      const isDemoRequest = demoTopics.includes(req.body.topic);

      // Only block duplicate for DEMO: one demo request per email
      if (isDemoRequest) {
        const existingDemoLead = await Lead.findOne({
          email: normalizedEmail,
          $or: [
            { demoRequested: true },
            { topic: { $in: demoTopics } }
          ]
        });
        if (existingDemoLead) {
          console.log('⚠️ Duplicate demo request:', { email: req.body.email, existingLeadId: existingDemoLead._id });
          return res.status(400).json({
            error: 'You have already contacted us. Our team will get back to you soon.',
            duplicate: true
          });
        }
      }
      // Normal contact (Scam Survival Kit, Education/Youth Pack, CoMaSi, Ambassador Program, Other): allow multiple messages per email

      // Create contact message (always, for both demo and normal contact)
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
        'ambassador-program': 'other',
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

        let lead;
        if (isDemoRequest) {
          // Demo: create new Lead (duplicate already blocked above)
          const leadData = {
            name: fullName,
            email: req.body.email,
            organizationName: req.body.organization || req.body.company || '',
            topic: req.body.topic,
            segment: segment,
            source: source,
            status: 'new',
            engagementCount: 0,
            demoRequested: true,
            teamSize: req.body.teamSize || '',
            studentStaffSize: req.body.studentStaffSize || '',
            message: req.body.message || '',
            address: req.body.address || '',
            city: req.body.city || '',
            state: req.body.state || '',
            country: req.body.country || '',
            phone: req.body.phone || '',
            department: req.body.department || '',
            position: req.body.position || '',
            website: req.body.website || ''
          };
          lead = await Lead.create(leadData);
          lead.status = lead.calculateStatus();
          await lead.save();
          console.log('✅ Unified lead created (demo):', { leadId: lead._id, email: lead.email, topic: lead.topic });
        } else {
          // Normal contact: add message to existing lead or create new lead with messages array
          const existingLead = await Lead.findOne({ email: normalizedEmail });
          const messageEntry = { topic: req.body.topic, text: req.body.message || '', createdAt: new Date() };
          if (existingLead) {
            if (!existingLead.messages) existingLead.messages = [];
            existingLead.messages.push(messageEntry);
            existingLead.message = req.body.message || '';
            existingLead.name = fullName;
            if (req.body.organization) existingLead.organizationName = req.body.organization || existingLead.organizationName;
            await existingLead.save();
            lead = existingLead;
            console.log('✅ Lead updated with new message (normal contact):', { leadId: lead._id, email: lead.email, messagesCount: lead.messages.length });
          } else {
            const leadData = {
              name: fullName,
              email: req.body.email,
              organizationName: req.body.organization || req.body.company || '',
              topic: req.body.topic,
              segment: segment,
              source: source,
              status: 'new',
              engagementCount: 0,
              demoRequested: false,
              message: req.body.message || '',
              messages: [messageEntry],
              teamSize: req.body.teamSize || '',
              studentStaffSize: req.body.studentStaffSize || '',
              address: req.body.address || '',
              city: req.body.city || '',
              state: req.body.state || '',
              country: req.body.country || '',
              phone: req.body.phone || '',
              department: req.body.department || '',
              position: req.body.position || '',
              website: req.body.website || ''
            };
            lead = await Lead.create(leadData);
            lead.status = lead.calculateStatus();
            await lead.save();
            console.log('✅ Unified lead created (normal contact):', { leadId: lead._id, email: lead.email, topic: lead.topic });
          }
        }
        } catch (unifiedError) {
        console.error('❌ Error creating/updating unified lead from contact:', unifiedError);
        console.error('Error details:', unifiedError.message, unifiedError.stack);
          // Only return duplicate error for demo (MongoDB duplicate key on email - should not happen for normal contact now)
          if (unifiedError.code === 11000 || unifiedError.message.includes('duplicate')) {
            return res.status(400).json({
              error: 'You have already contacted us. Our team will get back to you soon.',
              duplicate: true
            });
          }
          // Don't fail the request if unified lead creation fails for other reasons
      }

      // Send demo request confirmation email for demo-related submissions
      // Previously only demo-schools/demo-businesses received a confirmation.
      // Now also include CoMaSi (B2B) and Education (B2E) submissions — and any form that sets formSource to b2b_form or b2e_form.
      const explicitDemoTopics = ['demo-schools', 'demo-businesses'];
      const additionalDemoTopics = ['CoMaSi', 'comasy', 'education', 'education-youth-pack', 'b2b_demo', 'demo-families'];
      const demoFormSources = ['b2b_form', 'b2e_form'];

      const isDemoTopic = explicitDemoTopics.includes(req.body.topic) || additionalDemoTopics.includes(req.body.topic);
      const isDemoFormSource = req.body.formSource && demoFormSources.includes(req.body.formSource);

      if (isDemoTopic || isDemoFormSource) {
        try {
          console.log('📧 Sending demo request confirmation email (topic/formSource):', { topic: req.body.topic, formSource: req.body.formSource });
          const emailResult = await sendDemoRequestConfirmationEmail(
            req.body.firstName,
            req.body.email
          );

          if (emailResult.success) {
            console.log('✅ Demo request confirmation email sent successfully:', emailResult.messageId);
          } else {
            console.warn('⚠️ Failed to send demo request confirmation email:', emailResult.message || emailResult.error);
            // Don't fail the request if email fails - just log the warning
          }
        } catch (emailError) {
          console.error('❌ Error sending demo request confirmation email:', emailError);
          // Don't fail the request if email fails - just log the error
        }
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
