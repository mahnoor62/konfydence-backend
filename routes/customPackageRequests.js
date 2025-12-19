const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const CustomPackageRequest = require('../models/CustomPackageRequest');
const Package = require('../models/Package');
const Card = require('../models/Card');
const User = require('../models/User');
const Organization = require('../models/Organization');
const School = require('../models/School');
const { sendStatusUpdateEmail, sendCustomPackageCreatedEmail } = require('../utils/emailService');

const router = express.Router();

// Route - customers can submit requests (authenticated for B2B/B2E users)
router.post(
  '/',
  authenticateToken,
  [
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

      // Get logged-in user to attach organizationId/schoolId
      const User = require('../models/User');
      const user = await User.findById(req.userId);
      
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Prepare request data with organizationId/schoolId
      const requestData = {
        ...req.body,
        organizationId: user.organizationId || req.body.organizationId || null,
        schoolId: user.schoolId || req.body.schoolId || null
      };

      const request = await CustomPackageRequest.create(requestData);
      const populated = await CustomPackageRequest.findById(request._id)
        .populate('organizationId', 'name uniqueCode')
        .populate('schoolId', 'name uniqueCode')
        .populate('productId', 'name description price');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Error creating custom package request:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Admin routes - view and manage requests
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, organizationName, organizationId, schoolId } = req.query;
    const query = {};
    
    // Super admin can see all, but organization/school admins see only their requests
    const user = await User.findById(req.userId);
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // If user is organization/school admin, filter by their organizationId/schoolId
    // Super admin (with packages permission) can see all
    // Check if user has admin role or packages permission
    const Admin = require('../models/Admin');
    const admin = await Admin.findById(req.userId);
    const isSuperAdmin = admin && admin.isActive;
    
    // Only filter by organization/school if user is NOT super admin and is a b2b/b2e user
    if (!isSuperAdmin && user && (user.role === 'b2b_user' || user.role === 'b2e_user')) {
      // Filter by organizationId or schoolId directly (more reliable than name)
      if (user.organizationId) {
        query.organizationId = user.organizationId;
      }
      if (user.schoolId) {
        query.schoolId = user.schoolId;
      }
      
      // Fallback: also filter by organization name if organizationId not set
      if (!user.organizationId && !user.schoolId) {
        let orgName = null;
        if (user.organizationId) {
          const org = await Organization.findById(user.organizationId);
          if (org) orgName = org.name;
        }
        if (user.schoolId) {
          const school = await School.findById(user.schoolId);
          if (school) orgName = school.name;
        }
        
        if (orgName) {
          query.organizationName = orgName;
        }
      }
    }
    
    // Also support direct organizationName filter
    if (organizationName) {
      query.organizationName = organizationName;
    }

    const requests = await CustomPackageRequest.find(query)
      .populate('requestedModifications.cardsToAdd', 'title category')
      .populate('requestedModifications.cardsToRemove', 'title category')
      .populate('productId', 'name description price')
      .populate('productIds', 'name description price visibility')
      .populate('customPackageId', 'name status')
      .sort({ createdAt: -1 });
    
    // Filter out completed requests (they should not show in the requests table)
    // Only show pending, reviewing, approved, or rejected requests
    // Hide completed requests only if productId or productIds exist
    const activeRequests = requests.filter(req => 
      req.status !== 'completed' || (!req.productId && (!req.productIds || req.productIds.length === 0))
    );
    
    console.log(`Found ${requests.length} total requests, ${activeRequests.length} active requests for user ${req.userId}`);
    res.json(activeRequests);
  } catch (error) {
    console.error('Error fetching custom package requests:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const request = await CustomPackageRequest.findById(req.params.id)
      .populate('organizationId', 'name uniqueCode')
      .populate('schoolId', 'name uniqueCode')
      .populate('productId', 'name description price')
      .populate('productIds', 'name description price visibility')
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
        .populate('productId', 'name description price');

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

      // Admin will create Product manually through admin panel
      // Product creation is handled in admin panel's handleCreatePackageSubmit
      
      // If productId is provided, add it to updateData
      if (req.body.productId) {
        updateData.productId = req.body.productId;
      }
      
      // If productIds array is provided, store it (for multiple products)
      if (req.body.productIds && Array.isArray(req.body.productIds)) {
        updateData.productIds = req.body.productIds;
      }
      
      const request = await CustomPackageRequest.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      )
        .populate('productId', 'name description price')
        .populate('productIds', 'name description price')
        .populate('organizationId')
        .populate('schoolId');
      
      if (!request) {
        return res.status(404).json({ error: 'Request not found' });
      }

      // If status is 'approved' and productIds are provided, create CustomPackage entry
      if (req.body.status === 'approved' && req.body.productIds && req.body.productIds.length > 0) {
        try {
          const CustomPackage = require('../models/CustomPackage');
          
          // Check if CustomPackage already exists for this request
          let customPackage = await CustomPackage.findOne({ 
            $or: [
              { organizationId: request.organizationId },
              { schoolId: request.schoolId }
            ],
            productIds: { $in: req.body.productIds }
          });

          if (!customPackage) {
            // Get pricing and seat data from request body (from admin form) or fallback to request data
            const pricingAmount = req.body.contractPricing?.amount || request.requestedModifications?.customPricing?.amount || 0;
            const pricingCurrency = req.body.contractPricing?.currency || request.requestedModifications?.customPricing?.currency || 'EUR';
            const pricingBillingType = req.body.contractPricing?.billingType || request.requestedModifications?.customPricing?.billingType || 'one_time';
            const seatLimit = req.body.seatLimit || request.requestedModifications?.seatLimit || 0;
            const startDate = req.body.contract?.startDate 
              ? new Date(req.body.contract.startDate)
              : (request.requestedModifications?.contractDuration?.startDate 
                  ? new Date(request.requestedModifications.contractDuration.startDate)
                  : new Date());

            // Prepare custom package data
            const customPackageData = {
              organizationId: request.organizationId || null,
              schoolId: request.schoolId || null,
              entityType: request.entityType || (request.organizationId ? 'organization' : 'institute'),
              productIds: req.body.productIds,
              name: `${request.organizationName} Custom Package`,
              description: request.requestedModifications?.additionalNotes || '',
              contractPricing: {
                amount: pricingAmount,
                currency: pricingCurrency,
                billingType: pricingBillingType,
                notes: request.requestedModifications?.customPricing?.notes || ''
              },
              seatLimit: seatLimit,
              contract: {
                startDate: startDate,
                status: 'pending'
              },
              expiryTime: req.body.expiryTime || null,
              expiryTimeUnit: req.body.expiryTimeUnit || null,
              status: 'pending'
            };

            // Calculate endDate if expiryTime and expiryTimeUnit are provided
            if (req.body.expiryTime && req.body.expiryTimeUnit) {
              const endDate = new Date(startDate);
              
              if (req.body.expiryTimeUnit === 'months') {
                endDate.setMonth(endDate.getMonth() + req.body.expiryTime);
              } else if (req.body.expiryTimeUnit === 'years') {
                endDate.setFullYear(endDate.getFullYear() + req.body.expiryTime);
              }
              
              customPackageData.contract.endDate = endDate;
            }

            customPackage = await CustomPackage.create(customPackageData);
            
            // Link CustomPackage to the request
            await CustomPackageRequest.findByIdAndUpdate(req.params.id, {
              customPackageId: customPackage._id
            });

            console.log('CustomPackage created successfully:', customPackage._id);
          } else {
            // Update existing CustomPackage with new productIds if needed
            if (req.body.productIds && req.body.productIds.length > 0) {
              await CustomPackage.findByIdAndUpdate(customPackage._id, {
                productIds: req.body.productIds,
                expiryTime: req.body.expiryTime || customPackage.expiryTime,
                expiryTimeUnit: req.body.expiryTimeUnit || customPackage.expiryTimeUnit
              });
            }
          }
        } catch (customPackageErr) {
          console.error('Error creating CustomPackage:', customPackageErr);
          // Don't fail the request update if CustomPackage creation fails
          // Just log the error
        }
      }

      let emailSent = false;
      let emailError = null;

      // Send email notification if status changed
      if (currentRequest.status !== req.body.status) {
        try {
          await sendStatusUpdateEmail(
            request,
            req.body.status,
            req.body.adminNotes || ''
          );
          emailSent = true;
        } catch (emailErr) {
          console.error('Error sending status update email:', emailErr);
          emailError = emailErr.message;
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
            .populate('addedCardIds', 'title category');
          
          if (customPackage) {
            console.log('Sending custom package creation email to:', request.contactEmail);
            await sendCustomPackageCreatedEmail(request, customPackage);
            emailSent = true;
          }
        } catch (emailErr) {
          console.error('Error sending custom package creation email:', emailErr);
          emailError = emailErr.message;
          // Don't fail the request if email fails
        }
      }

      res.json({
        ...request.toObject(),
        emailSent,
        emailError: emailError || null
      });
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

