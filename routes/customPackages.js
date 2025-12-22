const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const CustomPackage = require('../models/CustomPackage');
const Package = require('../models/Package');
const Organization = require('../models/Organization');
const CustomPackageRequest = require('../models/CustomPackageRequest');
const { sendCustomPackageCreatedEmail } = require('../utils/emailService');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { organizationId, schoolId } = req.query;
    const query = {};

    // Super admin can see all, but organization/school admins see only their packages
    const User = require('../models/User');
    const Admin = require('../models/Admin');
    const School = require('../models/School');
    const user = await User.findById(req.userId);
    const admin = await Admin.findById(req.userId);
    const isSuperAdmin = admin && admin.isActive;

    // Initialize owner IDs (used for logging and query building)
    let ownerOrgId = null;
    let ownerSchoolId = null;

    // If not super admin, filter by user's organization/school
    if (!isSuperAdmin && user) {
      // Check if user is owner of any organization/school

      // Find organizations where user is owner
      const orgAsOwner = await Organization.findOne({ ownerId: user._id });
      if (orgAsOwner) {
        ownerOrgId = orgAsOwner._id;
      }

      // Find schools where user is owner
      const schoolAsOwner = await School.findOne({ ownerId: user._id });
      if (schoolAsOwner) {
        ownerSchoolId = schoolAsOwner._id;
      }

      // Build query: user's organizationId/schoolId OR user's owned organization/school
      const orgIds = [];
      const schoolIds = [];

      if (user.organizationId) {
        orgIds.push(user.organizationId);
      }
      if (ownerOrgId) {
        orgIds.push(ownerOrgId);
      }
      if (user.schoolId) {
        schoolIds.push(user.schoolId);
      }
      if (ownerSchoolId) {
        schoolIds.push(ownerSchoolId);
      }

      // Use $or to match any of the organization/school IDs
      if (orgIds.length > 0 || schoolIds.length > 0) {
        query.$or = [];
        if (orgIds.length > 0) {
          query.$or.push({ organizationId: { $in: orgIds } });
        }
        if (schoolIds.length > 0) {
          query.$or.push({ schoolId: { $in: schoolIds } });
        }
      } else {
        // If user has no organization/school, return empty array
        return res.json([]);
      }
    } else {
      // Super admin can filter by query params
      if (organizationId) query.organizationId = organizationId;
      if (schoolId) query.schoolId = schoolId;
    }

    console.log('🔍 Custom packages query:', JSON.stringify(query, null, 2));
    console.log('🔍 User ID:', req.userId);
    console.log('🔍 User organizationId:', user?.organizationId);
    console.log('🔍 User schoolId:', user?.schoolId);
    console.log('🔍 Owner Org ID:', ownerOrgId);
    console.log('🔍 Owner School ID:', ownerSchoolId);

    const customPackages = await CustomPackage.find(query)
      .populate('basePackageId', 'name description')
      .populate('organizationId', 'name uniqueCode segment')
      .populate('schoolId', 'name uniqueCode')
      .populate('productIds', 'name description price visibility imageUrl')
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${customPackages.length} custom packages for user ${req.userId}`);
    customPackages.forEach(cp => {
      console.log(`  - Package ${cp._id}: name=${cp.name}, status=${cp.status}, orgId=${cp.organizationId?._id || cp.organizationId}, schoolId=${cp.schoolId?._id || cp.schoolId}`);
    });

    res.json(customPackages);
  } catch (error) {
    console.error('Error fetching custom packages:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authenticateToken, checkPermission('organizations'), async (req, res) => {
  try {
    const customPackage = await CustomPackage.findById(req.params.id)
      .populate('basePackageId')
      .populate('organizationId')
      .populate('addedCardIds');
    if (!customPackage) {
      return res.status(404).json({ error: 'Custom package not found' });
    }
    res.json(customPackage);
  } catch (error) {
    console.error('Error fetching custom package:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/',
  authenticateToken,
  checkPermission('organizations'),
  [
    body('basePackageId').notEmpty(),
    body('contractPricing.amount').isNumeric(),
    body('contractPricing.billingType').isIn(['one_time', 'subscription', 'per_seat']),
    body('seatLimit').isInt({ min: 1 }),
    body('contract.startDate').isISO8601(),
    body('contract.endDate').isISO8601()
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

      // Check if organizationId or schoolId is provided
      let organization = null;
      let school = null;

      if (req.body.organizationId) {
        organization = await Organization.findById(req.body.organizationId);
        if (!organization) {
          return res.status(404).json({ error: 'Organization not found' });
        }
      }

      if (req.body.schoolId) {
        const School = require('../models/School');
        school = await School.findById(req.body.schoolId);
        if (!school) {
          return res.status(404).json({ error: 'School not found' });
        }
      }

      if (!organization && !school) {
        return res.status(400).json({ error: 'Either organizationId or schoolId is required' });
      }

      // Log incoming request body for debugging
      console.log('📦 Creating custom package - Request body:', {
        customPackageRequestId: req.body.customPackageRequestId,
        organizationId: req.body.organizationId,
        schoolId: req.body.schoolId,
        name: req.body.name
      });

      // Ensure productIds array is properly formatted
      let productIds = [];
      if (req.body.productIds && Array.isArray(req.body.productIds)) {
        productIds = req.body.productIds.map(id => {
          // Handle both string IDs and object IDs
          return typeof id === 'object' ? (id._id || id.id || id) : id;
        }).filter(id => id); // Remove any null/undefined values
      } else if (req.body.productId) {
        // Handle single productId (backward compatibility)
        productIds = [req.body.productId];
      }
      
      console.log('📦 ProductIds to save:', productIds);
      console.log('📦 ProductIds count:', productIds.length);

      const customPackage = await CustomPackage.create({
        ...req.body,
        name: req.body.name || basePackage.name,
        description: req.body.description || basePackage.description,
        productIds: productIds.length > 0 ? productIds : req.body.productIds || [] // Ensure productIds array is set
      });

      await customPackage.save();
      
      console.log('✅ CustomPackage created successfully:', customPackage._id);
      console.log('📦 Request body customPackageRequestId:', req.body.customPackageRequestId);
      console.log('📦 Full request body keys:', Object.keys(req.body));

      // Add custom package to organization's customPackages array
      try {
        if (organization && !organization.customPackages.includes(customPackage._id)) {
          organization.customPackages.push(customPackage._id);
          await organization.save();
          console.log('✅ Added custom package to organization:', organization.name);
        }
      } catch (orgError) {
        console.error('❌ Error adding to organization:', orgError);
      }

      // Add custom package to school's customPackages array
      try {
        if (school && !school.customPackages.includes(customPackage._id)) {
          school.customPackages.push(customPackage._id);
          await school.save();
          console.log('✅ Added custom package to school:', school.name);
        }
      } catch (schoolError) {
        console.error('❌ Error adding to school:', schoolError);
      }

      console.log('📦 Populating custom package data...');
      let populated;
      try {
        populated = await CustomPackage.findById(customPackage._id)
          .populate('basePackageId')
          .populate('organizationId')
          .populate('addedCardIds');
        console.log('✅ Custom package populated successfully');
        console.log('📦 Populated package ID:', populated?._id);
      } catch (populateError) {
        console.error('❌ Error populating custom package:', populateError);
        console.error('❌ Populate error stack:', populateError.stack);
        // Don't throw - continue with email sending even if populate fails
        populated = customPackage; // Use unpopulated version as fallback
      }

      // Send email notification
      // Priority: 1) customPackageRequestId contactEmail, 2) Organization primaryContact.email
      console.log('📧 ========== EMAIL SENDING PROCESS STARTED ==========');
      console.log('📧 Custom package ID:', customPackage._id);
      console.log('📧 Request body customPackageRequestId:', req.body.customPackageRequestId);
      console.log('📧 Organization ID:', req.body.organizationId);
      console.log('📧 School ID:', req.body.schoolId);
      
      let emailSent = false;
      let emailRecipient = null;
      let emailError = null;
      let emailRequest = null; // Store request object for email template
      
      try {
        // Step 1: Try to find request using customPackageRequestId
        if (req.body.customPackageRequestId) {
          console.log('🔍 Finding custom package request:', req.body.customPackageRequestId);
          
          const relatedRequest = await CustomPackageRequest.findById(req.body.customPackageRequestId)
            .populate('basePackageId');
          
          if (relatedRequest && relatedRequest.contactEmail) {
            emailRecipient = relatedRequest.contactEmail;
            emailRequest = relatedRequest;
            console.log('✅ Found request with email:', emailRecipient);
            console.log('📧 Contact Name:', relatedRequest.contactName);
            console.log('📧 Organization:', relatedRequest.organizationName);
          } else {
            console.warn('⚠️ Request not found or no contactEmail');
          }
        }
        
        // Step 2: If no request email, try organization primaryContact.email
        if (!emailRecipient && organization && organization.primaryContact && organization.primaryContact.email) {
          emailRecipient = organization.primaryContact.email;
          // Create a mock request object for email template
          emailRequest = {
            contactName: organization.primaryContact.name || organization.name,
            contactEmail: organization.primaryContact.email,
            organizationName: organization.name,
            basePackageId: populated.basePackageId || basePackage,
            requestedModifications: {
              seatLimit: customPackage.seatLimit
            }
          };
          console.log('✅ Using organization primaryContact email:', emailRecipient);
          console.log('📧 Contact Name:', emailRequest.contactName);
          console.log('📧 Organization:', emailRequest.organizationName);
        }
        
        // Step 3: If no organization email, try school primaryContact.email
        if (!emailRecipient && school) {
          const School = require('../models/School');
          const populatedSchool = await School.findById(school._id || school);
          if (populatedSchool && populatedSchool.primaryContact && populatedSchool.primaryContact.email) {
            emailRecipient = populatedSchool.primaryContact.email;
            // Create a mock request object for email template
            emailRequest = {
              contactName: populatedSchool.primaryContact.name || populatedSchool.name,
              contactEmail: populatedSchool.primaryContact.email,
              organizationName: populatedSchool.name,
              basePackageId: populated.basePackageId || basePackage,
              requestedModifications: {
                seatLimit: customPackage.seatLimit
              }
            };
            console.log('✅ Using school primaryContact email:', emailRecipient);
            console.log('📧 Contact Name:', emailRequest.contactName);
            console.log('📧 School:', emailRequest.organizationName);
          }
        }
        
        // Step 4: Send email if recipient found
        if (emailRecipient && emailRequest) {
          console.log('📧 Sending email to:', emailRecipient);
          const emailResult = await sendCustomPackageCreatedEmail(emailRequest, populated);
          
          if (emailResult.success) {
            console.log('✅ Email sent successfully!');
            console.log('✅ Message ID:', emailResult.messageId);
            emailSent = true;
          } else {
            console.error('❌ Email sending failed:', emailResult.error || emailResult.message);
            emailError = emailResult.error || emailResult.message || 'Email sending failed';
          }
        } else {
          console.warn('⚠️ No email recipient found');
          emailError = 'No email recipient found (no customPackageRequestId, no organization primaryContact, no school primaryContact)';
        }
      } catch (error) {
        console.error('❌ Error in email sending process:', error);
        console.error('❌ Error stack:', error.stack);
        emailError = error.message || 'Unknown error';
      }
      
      console.log('📧 Email sending completed:', {
        emailSent,
        emailRecipient,
        emailError
      });

      // Return response with email status
      const responseData = {
        ...populated.toObject(),
        emailSent: emailSent,
        emailRecipient: emailRecipient,
        emailError: emailError
      };
      
      console.log('📧 Final email status in response:', {
        emailSent: responseData.emailSent,
        emailRecipient: responseData.emailRecipient,
        emailError: responseData.emailError
      });
      
      res.status(201).json(responseData);
    } catch (error) {
      console.error('Error creating custom package:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put(
  '/:id',
  authenticateToken,
  checkPermission('organizations'),
  async (req, res) => {
    try {
      const customPackage = await CustomPackage.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      )
        .populate('basePackageId')
        .populate('organizationId')
        .populate('schoolId')
        .populate('productIds', 'name description price visibility imageUrl');

      if (!customPackage) {
        return res.status(404).json({ error: 'Custom package not found' });
      }

      res.json(customPackage);
    } catch (error) {
      console.error('Error updating custom package:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.delete('/:id', authenticateToken, checkPermission('organizations'), async (req, res) => {
  try {
    const customPackage = await CustomPackage.findById(req.params.id);

    if (!customPackage) {
      return res.status(404).json({ error: 'Custom package not found' });
    }

    // Remove from organization's customPackages array
    const organization = await Organization.findById(customPackage.organizationId);
    if (organization) {
      organization.customPackages = organization.customPackages.filter(
        id => id.toString() !== customPackage._id.toString()
      );
      await organization.save();
    }

    // Delete the custom package
    await CustomPackage.findByIdAndDelete(req.params.id);

    res.json({ message: 'Custom package deleted successfully' });
  } catch (error) {
    console.error('Error deleting custom package:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

