const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const CustomPackageRequest = require('../models/CustomPackageRequest');
const Package = require('../models/Package');
const Card = require('../models/Card');
const { sendStatusUpdateEmail, sendCustomPackageCreatedEmail } = require('../utils/emailService');

const router = express.Router();

// Public route - customers can submit requests
router.post(
  '/',
  [
    body('basePackageId').notEmpty().withMessage('Base package is required'),
    body('organizationName').notEmpty().trim().withMessage('Organization name is required'),
    body('contactName').notEmpty().trim().withMessage('Contact name is required'),
    body('contactEmail').isEmail().withMessage('Valid email is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const basePackage = await Package.findById(req.body.basePackageId);
      if (!basePackage) {
        return res.status(404).json({ error: 'Base package not found' });
      }

      const request = await CustomPackageRequest.create(req.body);
      const populated = await CustomPackageRequest.findById(request._id)
        .populate('basePackageId', 'name description');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Error creating custom package request:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Admin routes - view and manage requests
router.get('/', authenticateToken, checkPermission('packages'), async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    const requests = await CustomPackageRequest.find(query)
      .populate('basePackageId', 'name description')
      .populate('requestedModifications.cardsToAdd', 'title category')
      .populate('requestedModifications.cardsToRemove', 'title category')
      .populate('customPackageId', 'name')
      .sort({ createdAt: -1 });
    
    console.log(`Found ${requests.length} custom package requests`);
    res.json(requests);
  } catch (error) {
    console.error('Error fetching custom package requests:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

router.get('/:id', authenticateToken, checkPermission('packages'), async (req, res) => {
  try {
    const request = await CustomPackageRequest.findById(req.params.id)
      .populate('basePackageId')
      .populate('requestedModifications.cardsToAdd')
      .populate('requestedModifications.cardsToRemove')
      .populate('customPackageId');
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    res.json(request);
  } catch (error) {
    console.error('Error fetching custom package request:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put(
  '/:id/status',
  authenticateToken,
  checkPermission('packages'),
  [
    body('status').isIn(['pending', 'reviewing', 'approved', 'rejected', 'completed']),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Get the current request to check if status is changing
      const currentRequest = await CustomPackageRequest.findById(req.params.id)
        .populate('basePackageId');

      if (!currentRequest) {
        return res.status(404).json({ error: 'Request not found' });
      }

      const updateData = {
        status: req.body.status
      };
      
      // Add adminNotes if provided
      if (req.body.adminNotes !== undefined) {
        updateData.adminNotes = req.body.adminNotes || '';
      }
      
      // Only set assignedTo if userId is available (from authenticateToken middleware)
      if (req.userId) {
        updateData.assignedTo = req.userId;
      }

      // If customPackageId is provided, add it to updateData
      if (req.body.customPackageId) {
        updateData.customPackageId = req.body.customPackageId;
      }
      
      const request = await CustomPackageRequest.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      )
        .populate('basePackageId')
        .populate('customPackageId');

      // Send email notification if status changed
      if (currentRequest.status !== req.body.status) {
        try {
          await sendStatusUpdateEmail(
            request,
            req.body.status,
            req.body.adminNotes || ''
          );
        } catch (emailError) {
          console.error('Error sending status update email:', emailError);
          // Don't fail the request if email fails
        }
      }

      // If custom package was created (status is completed and customPackageId is set), send package creation email
      if (req.body.status === 'completed' && req.body.customPackageId) {
        try {
          const CustomPackage = require('../models/CustomPackage');
          const customPackage = await CustomPackage.findById(req.body.customPackageId)
            .populate('basePackageId', 'name description')
            .populate('organizationId', 'name segment primaryContact')
            .populate('effectiveCardIds', 'title category')
            .populate('addedCardIds', 'title category')
            .populate('removedCardIds', 'title category');
          
          if (customPackage) {
            console.log('Sending custom package creation email to:', request.contactEmail);
            await sendCustomPackageCreatedEmail(request, customPackage);
          }
        } catch (emailError) {
          console.error('Error sending custom package creation email:', emailError);
          // Don't fail the request if email fails
        }
      }

      res.json(request);
    } catch (error) {
      console.error('Error updating request status:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Delete custom package request
router.delete('/:id', authenticateToken, checkPermission('packages'), async (req, res) => {
  try {
    const request = await CustomPackageRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    await CustomPackageRequest.findByIdAndDelete(req.params.id);
    res.json({ message: 'Request deleted successfully' });
  } catch (error) {
    console.error('Error deleting custom package request:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

