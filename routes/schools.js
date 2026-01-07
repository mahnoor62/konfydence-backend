const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const School = require('../models/School');

const router = express.Router();

// Public route to get school by code (for member registration/login)
router.get('/code/:code', async (req, res) => {
  try {
    const school = await School.findOne({ 
      uniqueCode: req.params.code.toUpperCase() 
    }).select('name uniqueCode type');

    if (!school) {
      return res.status(404).json({ error: 'School not found' });
    }

    res.json(school);
  } catch (error) {
    console.error('Error fetching school by code:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Public route to search schools by name (for member registration)
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const query = {};

    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const schools = await School.find(query)
      .select('name uniqueCode type')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(schools);
  } catch (error) {
    console.error('Error searching schools:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/admin', authenticateToken, checkPermission('organizations'), async (req, res) => {
  try {
    const { status, type, search } = req.query;
    const query = {};

    if (status) query.status = status;
    if (type) query.type = type;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'primaryContact.name': { $regex: search, $options: 'i' } },
        { 'primaryContact.email': { $regex: search, $options: 'i' } }
      ];
    }

    const schools = await School.find(query)
      .populate('customPackages')
      .sort({ createdAt: -1 });

    res.json(schools);
  } catch (error) {
    console.error('Error fetching schools:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/',
  authenticateToken,
  checkPermission('organizations'),
  [
    body('name').notEmpty().trim(),
    body('type').isIn(['school', 'govt', 'other']),
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

      // Check if school with same name already exists (case-insensitive)
      // Escape special regex characters in the name
      const escapedName = req.body.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const duplicateSchool = await School.findOne({ 
        name: { $regex: new RegExp(`^${escapedName}$`, 'i') } 
      });
      if (duplicateSchool) {
        return res.status(400).json({ 
          error: `A school/institute with the name "${req.body.name.trim()}" already exists. Please use a different name.`
        });
      }

      // Set ownerId from authenticated user (admin creating the school)
      const schoolData = {
        ...req.body,
        ownerId: req.userId // Admin user creating the school
      };

      const school = await School.create(schoolData);
      res.status(201).json(school);
    } catch (error) {
      console.error('Error creating school:', error);
      
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
        message: error.message || 'Failed to create school'
      });
    }
  }
);

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const school = await School.findById(req.params.id);

    if (!school) {
      return res.status(404).json({ error: 'School not found' });
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
    // Admins can access all schools
    if (!currentUser && !isAdmin) {
      return res.status(401).json({ error: 'User not found' });
    }

    const isOwner = currentUser && school.ownerId && school.ownerId.toString() === currentUser._id.toString();
    const isMember = currentUser && currentUser.schoolId && currentUser.schoolId.toString() === school._id.toString();

    // If member (not owner), only return name and code
    if (isMember && !isOwner && !isAdmin) {
      return res.json({
        _id: school._id,
        name: school.name,
        uniqueCode: school.uniqueCode
      });
    }

    // For owners/admins, return full details
    await school.populate({
      path: 'customPackages',
      populate: {
        path: 'basePackageId',
        select: 'name description'
      }
    });
    
    // Populate students array (similar to organizations.members)
    await school.populate({
      path: 'students',
      select: 'name email memberStatus isActive createdAt memberApprovedAt role _id'
    });
    
    // Populate transactionIds array
    await school.populate({
      path: 'transactionIds',
      select: '_id type status amount currency createdAt packageId customPackageId'
    });

    // Import Transaction model
    const Transaction = require('../models/Transaction');
    
    // Get all users who have joined this school
    const allJoinedMembers = await User.find({ 
      schoolId: req.params.id,
      role: { $in: ['b2b_member', 'b2e_member'] },
      memberStatus: 'approved' // Only approved members
    }).select('name email memberStatus isActive createdAt memberApprovedAt role _id');

    // Format members data (OrgUser model removed, using User table only)
    const formattedMembers = allJoinedMembers.map(user => ({
      userId: user,
      organizationId: school._id,
      assignedCustomPackageIds: [],
      createdAt: user.createdAt || new Date(),
      updatedAt: user.updatedAt || new Date()
    }));

    res.json({
      ...school.toObject(),
      schoolUsers: formattedMembers
    });
  } catch (error) {
    console.error('Error fetching school:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

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
        const duplicateSchool = await School.findOne({ 
          name: { $regex: new RegExp(`^${escapedName}$`, 'i') },
          _id: { $ne: req.params.id } // Exclude current school
        });
        if (duplicateSchool) {
          return res.status(400).json({ 
            error: `A school/institute with the name "${req.body.name.trim()}" already exists. Please use a different name.`
          });
        }
      }

      const school = await School.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );

      if (!school) {
        return res.status(404).json({ error: 'School not found' });
      }

      res.json(school);
    } catch (error) {
      console.error('Error updating school:', error);
      
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
        message: error.message || 'Failed to update school'
      });
    }
  }
);

router.delete(
  '/:id',
  authenticateToken,
  checkPermission('organizations'),
  async (req, res) => {
    try {
      const school = await School.findByIdAndDelete(req.params.id);

      if (!school) {
        return res.status(404).json({ error: 'School not found' });
      }

      res.json({ message: 'School deleted successfully' });
    } catch (error) {
      console.error('Error deleting school:', error);
      res.status(500).json({ 
        error: 'Server error',
        message: error.message || 'Failed to delete school'
      });
    }
  }
);

module.exports = router;

