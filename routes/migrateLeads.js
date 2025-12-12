const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const B2BLead = require('../models/B2BLead');
const EducationLead = require('../models/EducationLead');
const ContactMessage = require('../models/ContactMessage');
const Lead = require('../models/Lead');

const router = express.Router();

// Migration endpoint to convert old leads to unified model
router.post('/migrate', authenticateToken, requireRole('super_admin'), async (req, res) => {
  try {
    let migrated = 0;
    let errors = 0;

    // Migrate B2B Leads
    const b2bLeads = await B2BLead.find();
    for (const oldLead of b2bLeads) {
      try {
        // Check if unified lead already exists
        const exists = await Lead.findOne({ 
          email: oldLead.email,
          segment: 'B2B',
          source: 'b2b_form'
        });
        
        if (!exists) {
          await Lead.create({
            name: oldLead.name,
            email: oldLead.email,
            phone: '',
            organizationName: oldLead.company,
            segment: 'B2B',
            source: 'b2b_form',
            status: oldLead.status || 'new'
          });
          migrated++;
        }
      } catch (err) {
        console.error('Error migrating B2B lead:', err);
        errors++;
      }
    }

    // Migrate Education Leads
    const eduLeads = await EducationLead.find();
    for (const oldLead of eduLeads) {
      try {
        // Check if unified lead already exists
        const exists = await Lead.findOne({ 
          email: oldLead.email,
          segment: 'B2E',
          source: 'b2e_form'
        });
        
        if (!exists) {
          await Lead.create({
            name: oldLead.name,
            email: oldLead.email,
            phone: '',
            organizationName: oldLead.school || oldLead.schoolName,
            segment: 'B2E',
            source: 'b2e_form',
            status: oldLead.status || 'new'
          });
          migrated++;
        }
      } catch (err) {
        console.error('Error migrating Education lead:', err);
        errors++;
      }
    }

    // Migrate Contact Messages (B2B demo and education)
    const contactMessages = await ContactMessage.find({
      topic: { $in: ['b2b_demo', 'education'] }
    });
    for (const msg of contactMessages) {
      try {
        const segment = msg.topic === 'b2b_demo' ? 'B2B' : 'B2E';
        const source = msg.topic === 'b2b_demo' ? 'b2b_form' : 'b2e_form';
        
        // Check if unified lead already exists
        const exists = await Lead.findOne({ 
          email: msg.email,
          segment: segment,
          source: source
        });
        
        if (!exists) {
          await Lead.create({
            name: msg.name,
            email: msg.email,
            phone: '',
            organizationName: msg.company || '',
            segment: segment,
            source: source,
            status: 'new'
          });
          migrated++;
        }
      } catch (err) {
        console.error('Error migrating Contact message:', err);
        errors++;
      }
    }

    res.json({
      message: 'Migration completed',
      migrated,
      errors,
      total: migrated + errors
    });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: 'Migration failed' });
  }
});

module.exports = router;


