const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const Organization = require('../models/Organization');
const OrgUser = require('../models/OrgUser');
const CustomPackage = require('../models/CustomPackage');

const router = express.Router();

// Public route to get organization by code (for member registration/login)
router.get('/code/:code', async (req, res) => {
  try {
    const organization = await Organization.findOne({ 
      uniqueCode: req.params.code.toUpperCase() 
    }).select('name uniqueCode type');

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(organization);
  } catch (error) {
    console.error('Error fetching organization by code:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Public route to search organizations by name (for member registration)
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const query = {};

    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const organizations = await Organization.find(query)
      .select('name uniqueCode type')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(organizations);
  } catch (error) {
    console.error('Error searching organizations:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/admin', authenticateToken, checkPermission('organizations'), async (req, res) => {
  try {
    const { segment, status, type, search } = req.query;
    const query = {};

    if (segment) query.segment = segment;
    if (status) query.status = status;
    if (type) query.type = type;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'primaryContact.name': { $regex: search, $options: 'i' } },
        { 'primaryContact.email': { $regex: search, $options: 'i' } }
      ];
    }

    const organizations = await Organization.find(query)
      .populate('customPackages')
      .sort({ createdAt: -1 });

    const orgsWithCounts = await Promise.all(
      organizations.map(async (org) => {
        const contracts = await CustomPackage.countDocuments({
          organizationId: org._id,
          'contract.status': 'active'
        });
        return {
          ...org.toObject(),
          activeContractsCount: contracts
        };
      })
    );

    res.json(orgsWithCounts);
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.id);

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Check if current user is owner, member, or admin
    const User = require('../models/User');
    const Admin = require('../models/Admin');
    let currentUser = null;
    let isAdmin = false;
    
    // Check if it's an admin token first
    if (req.userId) {
      // Try to find admin first (admin tokens use adminId)
      const admin = await Admin.findById(req.userId);
      if (admin) {
        isAdmin = true;
      } else {
        // If not admin, try to find regular user
        currentUser = await User.findById(req.userId);
        if (currentUser) {
          isAdmin = currentUser.role === 'admin' || currentUser.role === 'super_admin';
        }
      }
    }

    // For admin panel access, allow if token is valid (authenticated)
    // Admins can access all organizations
    if (!currentUser && !isAdmin) {
      return res.status(401).json({ error: 'User not found' });
    }

    const isOwner = currentUser && organization.ownerId && organization.ownerId.toString() === currentUser._id.toString();
    const isMember = currentUser && currentUser.organizationId && currentUser.organizationId.toString() === organization._id.toString();

    // If member (not owner), only return name and code
    if (isMember && !isOwner && !isAdmin) {
      return res.json({
        organization: {
          _id: organization._id,
          name: organization.name,
          uniqueCode: organization.uniqueCode
        },
        orgUsers: [] // Don't show other members to members
      });
    }

    // For owners/admins, return full details
    // Remove duplicate custom package IDs from database array
    if (organization.customPackages && organization.customPackages.length > 0) {
      const seen = new Set();
      const uniqueIds = organization.customPackages.filter((pkgId) => {
        const id = pkgId?.toString();
        if (seen.has(id)) {
          return false; // Duplicate found
        }
        seen.add(id);
        return true;
      });
      
      // If duplicates found, update database
      if (uniqueIds.length !== organization.customPackages.length) {
        organization.customPackages = uniqueIds;
        await organization.save();
      }
    }

    // Now populate with unique packages
    await organization.populate({
      path: 'customPackages',
      populate: {
        path: 'basePackageId',
        select: 'name description'
      }
    });
    
    // Populate transactionIds array
    await organization.populate({
      path: 'transactionIds',
      select: '_id type status amount currency createdAt packageId customPackageId'
    });

    // First, get all users who have joined this organization (approved members)
    const allJoinedMembers = await User.find({ 
      organizationId: req.params.id,
      role: { $in: ['b2b_member', 'b2e_member'] },
      memberStatus: 'approved'
    }).select('name email memberStatus isActive createdAt memberApprovedAt role _id');

    // Merge with organization.members array for robustness
    const memberIds = [
      ...new Set([
        ...allJoinedMembers.map(m => m._id.toString()),
        ...(organization.members || []).map(m => m.toString())
      ])
    ];

    // Fetch OrgUser records for these members
    const orgUsers = await OrgUser.find({ 
      organizationId: req.params.id,
      ...(memberIds.length > 0 ? { userId: { $in: memberIds } } : {})
    })
      .populate('userId', 'name email memberStatus isActive createdAt memberApprovedAt role')
      .populate('assignedCustomPackageIds');

    // Combine OrgUser data with member data
    const memberMap = new Map();
    
    // Add members from OrgUser
    orgUsers.forEach(orgUser => {
      if (orgUser.userId) {
        const userId = orgUser.userId._id.toString();
        memberMap.set(userId, {
          _id: orgUser._id,
          userId: orgUser.userId,
          organizationId: orgUser.organizationId,
          assignedCustomPackageIds: orgUser.assignedCustomPackageIds,
          createdAt: orgUser.createdAt,
          updatedAt: orgUser.updatedAt
        });
      }
    });

    // Add members from User table (approved members) who are not in OrgUser
    allJoinedMembers.forEach(user => {
      const userId = user._id.toString();
      if (!memberMap.has(userId)) {
        // Create a virtual OrgUser-like structure
        memberMap.set(userId, {
          userId: user,
          organizationId: req.params.id,
          assignedCustomPackageIds: [],
          createdAt: user.createdAt || new Date(),
          updatedAt: user.updatedAt || new Date()
        });
      }
    });

    // Convert map to array
    const allOrgUsers = Array.from(memberMap.values());

    res.json({
      organization,
      orgUsers: allOrgUsers
    });
  } catch (error) {
    console.error('Error fetching organization:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/',
  authenticateToken,
  checkPermission('organizations'),
  [
    body('name').notEmpty().trim(),
    body('type').isIn(['company', 'bank', 'school', 'govt', 'other']),
    body('segment').isIn(['B2B', 'B2E']),
    body('primaryContact.name').notEmpty(),
    body('primaryContact.email').isEmail()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: 'Validation failed',
          details: errors.array()
        });
      }

      // Check if organization with same name already exists (case-insensitive)
      // Escape special regex characters in the name
      const escapedName = req.body.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const duplicateOrg = await Organization.findOne({ 
        name: { $regex: new RegExp(`^${escapedName}$`, 'i') } 
      });
      if (duplicateOrg) {
        return res.status(400).json({ 
          error: `An organization with the name "${req.body.name.trim()}" already exists. Please use a different name.`
        });
      }

      // Set ownerId from authenticated user (admin creating the organization)
      const organizationData = {
        ...req.body,
        ownerId: req.userId // Admin user creating the organization
      };

      const organization = await Organization.create(organizationData);
      res.status(201).json(organization);
    } catch (error) {
      console.error('Error creating organization:', error);
      
      // Return detailed error message
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message
        }));
        return res.status(400).json({ 
          error: 'Validation failed',
          details: validationErrors
        });
      }
      
      res.status(500).json({ 
        error: 'Server error',
        message: error.message || 'Failed to create organization'
      });
    }
  }
);

router.put(
  '/:id',
  authenticateToken,
  checkPermission('organizations'),
  async (req, res) => {
    try {
      // Check if name is being changed and if duplicate exists
      if (req.body.name) {
        // Escape special regex characters in the name
        const escapedName = req.body.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const duplicateOrg = await Organization.findOne({ 
          name: { $regex: new RegExp(`^${escapedName}$`, 'i') },
          _id: { $ne: req.params.id } // Exclude current organization
        });
        if (duplicateOrg) {
          return res.status(400).json({ 
            error: `An organization with the name "${req.body.name.trim()}" already exists. Please use a different name.`
          });
        }
      }

      const organization = await Organization.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );

      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      res.json(organization);
    } catch (error) {
      console.error('Error updating organization:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put('/:id/seat-usage', authenticateToken, checkPermission('organizations'), async (req, res) => {
  try {
    const { seatLimit, usedSeats } = req.body;
    const organization = await Organization.findByIdAndUpdate(
      req.params.id,
      { 'seatUsage.seatLimit': seatLimit, 'seatUsage.usedSeats': usedSeats },
      { new: true }
    );

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(organization);
  } catch (error) {
    console.error('Error updating seat usage:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, checkPermission('organizations'), async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.id);

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Delete related OrgUser records
    await OrgUser.deleteMany({ organizationId: req.params.id });

    // Delete related CustomPackages
    await CustomPackage.deleteMany({ organizationId: req.params.id });

    // Remove organization reference from Leads
    const Lead = require('../models/Lead');
    await Lead.updateMany(
      { convertedOrganizationId: req.params.id },
      { $unset: { convertedOrganizationId: '' } }
    );

    // Delete the organization
    await Organization.findByIdAndDelete(req.params.id);

    res.json({ message: 'Organization deleted successfully' });
  } catch (error) {
    console.error('Error deleting organization:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

