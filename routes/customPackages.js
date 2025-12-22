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

    // Initialize customPackageIdsFromRequests outside the if block to avoid ReferenceError
    let customPackageIdsFromRequests = [];

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
      // OR packages created from user's custom package requests
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

      // Also check if user has any completed custom package requests
      // and include packages created from those requests
      try {
        const CustomPackageRequest = require('../models/CustomPackageRequest');
        const User = require('../models/User');
        const userEmail = user.email?.toLowerCase();
        
        // Find requests by user's email (contactEmail) that are completed
        const userRequests = await CustomPackageRequest.find({
          contactEmail: userEmail,
          status: 'completed',
          customPackageId: { $ne: null }
        }).select('customPackageId');
        
        if (userRequests && userRequests.length > 0) {
          userRequests.forEach(req => {
            if (req.customPackageId) {
              customPackageIdsFromRequests.push(req.customPackageId);
            }
          });
          console.log('✅ Found custom packages from user requests:', customPackageIdsFromRequests.length);
        }
      } catch (requestError) {
        console.warn('⚠️ Error checking user requests:', requestError);
      }

      // Build query with $or conditions
      const orConditions = [];
      
      // Add organization/school conditions
      if (orgIds.length > 0 || schoolIds.length > 0) {
        if (orgIds.length > 0) {
          orConditions.push({ organizationId: { $in: orgIds } });
        }
        if (schoolIds.length > 0) {
          orConditions.push({ schoolId: { $in: schoolIds } });
        }
      }
      
      // Add custom package IDs from user's requests
      if (customPackageIdsFromRequests.length > 0) {
        orConditions.push({ _id: { $in: customPackageIdsFromRequests } });
      }

      // Use $or to match any of the conditions
      if (orConditions.length > 0) {
        query.$or = orConditions;
      } else {
        // If user has no organization/school and no requests, return empty array
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

    // For non-admin users, show 'active' packages OR packages from their requests (even if pending)
    // Super admins can see all packages (including pending/archived)
    let customPackages;
    if (!isSuperAdmin) {
      // If we have customPackageIdsFromRequests, fetch all matching packages and filter
      if (customPackageIdsFromRequests.length > 0) {
        // Fetch packages matching organizationId/schoolId OR from requests (no status filter yet)
        customPackages = await CustomPackage.find(query)
          .populate('basePackageId', 'name description')
          .populate('organizationId', 'name uniqueCode segment')
          .populate('schoolId', 'name uniqueCode')
          .populate({
            path: 'productIds',
            select: 'name description price visibility imageUrl category',
            populate: {
              path: 'level1 level2 level3',
              select: 'title category rating',
              model: 'Card'
            }
          })
          .sort({ createdAt: -1 });
        
        // Filter: show active packages OR packages from user's requests (even if pending)
        const requestIdsSet = new Set(customPackageIdsFromRequests.map(id => id.toString()));
        customPackages = customPackages.filter(cp => {
          const isFromRequest = requestIdsSet.has(cp._id.toString());
          return cp.status === 'active' || isFromRequest;
        });
      } else {
        // No requests, only show active packages
        query.status = 'active';
        customPackages = await CustomPackage.find(query)
          .populate('basePackageId', 'name description')
          .populate('organizationId', 'name uniqueCode segment')
          .populate('schoolId', 'name uniqueCode')
          .populate({
            path: 'productIds',
            select: 'name description price visibility imageUrl category',
            populate: {
              path: 'level1 level2 level3',
              select: 'title category rating',
              model: 'Card'
            }
          })
          .sort({ createdAt: -1 });
      }
    } else {
      // Super admin - show all
      customPackages = await CustomPackage.find(query)
        .populate('basePackageId', 'name description')
        .populate('organizationId', 'name uniqueCode segment')
        .populate('schoolId', 'name uniqueCode')
        .populate('productIds', 'name description price visibility imageUrl')
        .sort({ createdAt: -1 });
    }

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
      .populate('organizationId', 'name uniqueCode segment')
      .populate('schoolId', 'name uniqueCode')
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
      // If customPackageRequestId is provided, extract organizationId/schoolId from request
      let organizationId = req.body.organizationId || null;
      let schoolId = req.body.schoolId || null;
      
      if (req.body.customPackageRequestId && (!organizationId && !schoolId)) {
        try {
          const CustomPackageRequest = require('../models/CustomPackageRequest');
          const relatedRequest = await CustomPackageRequest.findById(req.body.customPackageRequestId);
          if (relatedRequest) {
            organizationId = relatedRequest.organizationId || organizationId;
            schoolId = relatedRequest.schoolId || schoolId;
            console.log('✅ Extracted organizationId/schoolId from request:', {
              organizationId,
              schoolId
            });
          }
        } catch (requestError) {
          console.warn('⚠️ Could not extract organizationId/schoolId from request:', requestError);
        }
      }
      
      let organization = null;
      let school = null;

      if (organizationId) {
        organization = await Organization.findById(organizationId);
        if (!organization) {
          return res.status(404).json({ error: 'Organization not found' });
        }
        console.log('✅ Organization found:', {
          id: organization._id,
          name: organization.name,
          hasPrimaryContact: !!organization.primaryContact,
          primaryContactEmail: organization.primaryContact?.email
        });
      }

      if (schoolId) {
        const School = require('../models/School');
        school = await School.findById(schoolId);
        if (!school) {
          return res.status(404).json({ error: 'School not found' });
        }
        console.log('✅ School found:', {
          id: school._id,
          name: school.name,
          hasPrimaryContact: !!school.primaryContact,
          primaryContactEmail: school.primaryContact?.email
        });
      }

      if (!organization && !school) {
        return res.status(400).json({ error: 'Either organizationId or schoolId is required' });
      }

      // Log incoming request body for debugging
      console.log('📦 Creating custom package - Request body:', {
        customPackageRequestId: req.body.customPackageRequestId,
        organizationId: organizationId || req.body.organizationId,
        schoolId: schoolId || req.body.schoolId,
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
        organizationId: organizationId || req.body.organizationId || null,
        schoolId: schoolId || req.body.schoolId || null,
        productIds: productIds.length > 0 ? productIds : req.body.productIds || [], // Ensure productIds array is set
        // Force status to 'active' when package is created (override any pending status from req.body)
        status: 'active',
        contract: {
          ...req.body.contract,
          status: 'active' // Force contract status to 'active'
        }
      });

      // Ensure status is 'active' (double check)
      if (customPackage.status !== 'active') {
        customPackage.status = 'active';
      }
      if (customPackage.contract.status !== 'active') {
        customPackage.contract.status = 'active';
      }
      await customPackage.save();
      
      console.log('✅ CustomPackage created successfully:', customPackage._id);
      console.log('📦 Request body customPackageRequestId:', req.body.customPackageRequestId);
      console.log('📦 Full request body keys:', Object.keys(req.body));
      
      // Find and update custom package request BEFORE email sending
      let relatedRequest = null;
      if (req.body.customPackageRequestId) {
        try {
          const CustomPackageRequest = require('../models/CustomPackageRequest');
          relatedRequest = await CustomPackageRequest.findById(req.body.customPackageRequestId)
            .populate('basePackageId');
          if (relatedRequest) {
            relatedRequest.customPackageId = customPackage._id;
            relatedRequest.status = 'completed';
            await relatedRequest.save();
            console.log('✅ Updated custom package request:', {
              requestId: relatedRequest._id,
              customPackageId: customPackage._id,
              status: 'completed',
              contactEmail: relatedRequest.contactEmail,
              contactName: relatedRequest.contactName,
              organizationName: relatedRequest.organizationName
            });
          } else {
            console.warn('⚠️ Custom package request not found:', req.body.customPackageRequestId);
          }
        } catch (requestUpdateError) {
          console.error('❌ Error updating custom package request:', requestUpdateError);
          console.error('❌ Error stack:', requestUpdateError.stack);
          // Don't fail the whole operation if request update fails
        }
      } else {
        console.warn('⚠️ No customPackageRequestId provided in request body');
      }

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

      // CRITICAL: Log that we're about to start email sending
      console.log('🚨 ABOUT TO START EMAIL SENDING PROCESS');
      console.log('🚨 populated exists?', !!populated);
      console.log('🚨 organization exists?', !!organization);
      console.log('🚨 school exists?', !!school);
      console.log('🚨 relatedRequest exists?', !!relatedRequest);

      // Send email notification
      // Priority: 1) customPackageRequestId contactEmail, 2) Organization primaryContact.email
      console.log('📧 ========== EMAIL SENDING PROCESS STARTED ==========');
      console.log('📧 This log should appear after CustomPackage created successfully');
      console.log('📧 Custom package ID:', customPackage._id);
      console.log('📧 Request body customPackageRequestId:', req.body.customPackageRequestId);
      console.log('📧 Organization ID:', req.body.organizationId);
      console.log('📧 School ID:', req.body.schoolId);
      console.log('📧 Current organization object:', organization ? {
        id: organization._id,
        name: organization.name,
        hasPrimaryContact: !!organization.primaryContact,
        primaryContactEmail: organization.primaryContact?.email
      } : 'NULL');
      console.log('📧 Current school object:', school ? {
        id: school._id,
        name: school.name,
        hasPrimaryContact: !!school.primaryContact,
        primaryContactEmail: school.primaryContact?.email
      } : 'NULL');
      
      let emailSent = false;
      let emailRecipient = null;
      let emailError = null;
      let emailRequest = null; // Store request object for email template
      
      console.log('📧 Starting email sending try block...');
      try {
        // Step 1: Try to use the request we already found (or find it again)
        // PRIORITY: If customPackageRequestId is provided, we MUST use the request's contactEmail
        if (req.body.customPackageRequestId) {
          console.log('🔍 Step 1: Using custom package request for email:', req.body.customPackageRequestId);
          console.log('🔍 relatedRequest exists?', !!relatedRequest);
          
          // Use the request we already found, or find it again if not found
          if (!relatedRequest) {
            console.log('🔍 relatedRequest not found, fetching again...');
            const CustomPackageRequest = require('../models/CustomPackageRequest');
            relatedRequest = await CustomPackageRequest.findById(req.body.customPackageRequestId)
              .populate('basePackageId');
            console.log('🔍 Fetched relatedRequest:', {
              found: !!relatedRequest,
              id: relatedRequest?._id,
              contactEmail: relatedRequest?.contactEmail
            });
          }
          
          if (relatedRequest) {
            if (relatedRequest.contactEmail) {
              emailRecipient = relatedRequest.contactEmail.toLowerCase().trim();
              emailRequest = relatedRequest;
              console.log('✅ Step 1 SUCCESS: Using request with email:', emailRecipient);
              console.log('📧 Contact Name:', relatedRequest.contactName);
              console.log('📧 Organization:', relatedRequest.organizationName);
              console.log('📧 Request Status:', relatedRequest.status);
            } else {
              console.error('❌ Step 1 FAILED: Request found but contactEmail is missing:', {
                requestId: relatedRequest._id,
                requestData: {
                  contactName: relatedRequest.contactName,
                  organizationName: relatedRequest.organizationName,
                  hasContactEmail: !!relatedRequest.contactEmail
                }
              });
              emailError = 'Request contactEmail is missing';
            }
          } else {
            console.error('❌ Step 1 FAILED: Custom package request not found:', req.body.customPackageRequestId);
            emailError = 'Custom package request not found';
          }
        } else {
          console.log('⚠️ Step 1 SKIPPED: No customPackageRequestId in request body');
        }
        
        // Step 2: If no request email, try organization primaryContact.email
        console.log('🔍 Step 2: Checking organization primaryContact...');
        console.log('🔍 Organization exists?', !!organization);
        console.log('🔍 Organization has primaryContact?', !!organization?.primaryContact);
        console.log('🔍 Organization primaryContact email?', organization?.primaryContact?.email);
        
        if (!emailRecipient && organization) {
          // Make sure organization is populated with primaryContact
          if (!organization.primaryContact) {
            console.log('🔍 Organization primaryContact not populated, fetching organization again...');
            const populatedOrg = await Organization.findById(organization._id);
            if (populatedOrg && populatedOrg.primaryContact && populatedOrg.primaryContact.email) {
              emailRecipient = populatedOrg.primaryContact.email;
              emailRequest = {
                contactName: populatedOrg.primaryContact.name || populatedOrg.name,
                contactEmail: populatedOrg.primaryContact.email,
                organizationName: populatedOrg.name,
                basePackageId: populated.basePackageId || basePackage,
                requestedModifications: {
                  seatLimit: customPackage.seatLimit
                }
              };
              console.log('✅ Step 2 SUCCESS: Using organization primaryContact email:', emailRecipient);
              console.log('📧 Contact Name:', emailRequest.contactName);
              console.log('📧 Organization:', emailRequest.organizationName);
            } else {
              console.warn('⚠️ Step 2 FAILED: Organization does not have primaryContact.email');
            }
          } else if (organization.primaryContact && organization.primaryContact.email) {
            emailRecipient = organization.primaryContact.email;
            emailRequest = {
              contactName: organization.primaryContact.name || organization.name,
              contactEmail: organization.primaryContact.email,
              organizationName: organization.name,
              basePackageId: populated.basePackageId || basePackage,
              requestedModifications: {
                seatLimit: customPackage.seatLimit
              }
            };
            console.log('✅ Step 2 SUCCESS: Using organization primaryContact email:', emailRecipient);
            console.log('📧 Contact Name:', emailRequest.contactName);
            console.log('📧 Organization:', emailRequest.organizationName);
          }
        } else if (emailRecipient) {
          console.log('⚠️ Step 2 SKIPPED: Email recipient already found from Step 1');
        } else {
          console.log('⚠️ Step 2 SKIPPED: No organization found');
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
        console.error('❌ ========== ERROR IN EMAIL SENDING PROCESS ==========');
        console.error('❌ Error in email sending process:', error);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error name:', error.name);
        console.error('❌ Error type:', typeof error);
        emailError = error.message || 'Unknown error';
      }
      
      console.log('📧 Email sending try-catch block completed');
      
      console.log('📧 ========== EMAIL SENDING PROCESS COMPLETED ==========');
      console.log('📧 Email sending completed:', {
        emailSent,
        emailRecipient,
        emailError,
        hasRecipient: !!emailRecipient,
        hasRequest: !!emailRequest,
        smtpConfigured: !!(process.env.SMTP_USER && process.env.SMTP_PASS)
      });

      // Log SMTP configuration status
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.error('❌ SMTP NOT CONFIGURED:');
        console.error('❌ SMTP_USER:', process.env.SMTP_USER ? 'Set' : 'MISSING');
        console.error('❌ SMTP_PASS:', process.env.SMTP_PASS ? 'Set' : 'MISSING');
        console.error('❌ SMTP_HOST:', process.env.SMTP_HOST || 'smtp.gmail.com (default)');
      } else {
        console.log('✅ SMTP Configuration Check:');
        console.log('✅ SMTP_USER:', process.env.SMTP_USER ? 'Set' : 'Missing');
        console.log('✅ SMTP_PASS:', process.env.SMTP_PASS ? 'Set' : 'Missing');
        console.log('✅ SMTP_HOST:', process.env.SMTP_HOST || 'smtp.gmail.com (default)');
      }

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
      
      // If email was not sent, log detailed error for debugging
      if (!emailSent) {
        console.error('❌ EMAIL NOT SENT - Debugging Info:');
        console.error('❌ Email Recipient:', emailRecipient || 'NOT FOUND');
        console.error('❌ Email Request Object:', emailRequest ? 'EXISTS' : 'MISSING');
        console.error('❌ Email Error:', emailError || 'NO ERROR MESSAGE');
        console.error('❌ Custom Package Request ID:', req.body.customPackageRequestId || 'NOT PROVIDED');
        console.error('❌ Organization ID:', req.body.organizationId || 'NOT PROVIDED');
        console.error('❌ School ID:', req.body.schoolId || 'NOT PROVIDED');
      }
      
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

