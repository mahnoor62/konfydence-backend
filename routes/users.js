const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const OrgUser = require('../models/OrgUser');
const Organization = require('../models/Organization');
const School = require('../models/School');

const router = express.Router();

// Helper function to safely extract ID from req.params.id
const extractId = (paramId) => {
  if (!paramId) return null;
  
  // If it's already a string, validate and return
  if (typeof paramId === 'string') {
    const trimmed = paramId.trim();
    // Check if it's a valid ObjectId format (24 hex characters)
    if (/^[0-9a-fA-F]{24}$/.test(trimmed)) {
      return trimmed;
    }
    // If it's "[object Object]" string, return null
    if (trimmed === '[object Object]' || trimmed.includes('[object')) {
      return null;
    }
    return trimmed;
  }
  
  // If it's an object, try to extract ID
  if (typeof paramId === 'object' && paramId !== null) {
    // Try _id first (Mongoose ObjectId)
    if (paramId._id) {
      const id = paramId._id.toString ? paramId._id.toString() : String(paramId._id);
      if (id && id !== '[object Object]' && /^[0-9a-fA-F]{24}$/.test(id.trim())) {
        return id.trim();
      }
    }
    // Try id property
    if (paramId.id) {
      const id = paramId.id.toString ? paramId.id.toString() : String(paramId.id);
      if (id && id !== '[object Object]' && /^[0-9a-fA-F]{24}$/.test(id.trim())) {
        return id.trim();
      }
    }
    // Last resort: try toString, but validate it
    try {
      const str = paramId.toString();
      if (str && str !== '[object Object]' && !str.includes('[object') && /^[0-9a-fA-F]{24}$/.test(str.trim())) {
        return str.trim();
      }
    } catch (e) {
      // Ignore toString errors
    }
  }
  
  return null;
};

// Get all memberships across all users
router.get('/memberships', authenticateToken, checkPermission('users'), async (req, res) => {
  try {
    const { status, membershipType, search } = req.query;
    
    // Get all users with memberships
    const users = await User.find({})
      .populate('memberships.packageId', 'name description')
      .select('name email role memberships')
      .sort({ createdAt: -1 });

    // Flatten memberships with user info
    const currentDate = new Date();
    let allMemberships = [];
    users.forEach(user => {
      if (user.memberships && user.memberships.length > 0) {
        user.memberships.forEach(membership => {
          // Check actual expiration status based on endDate
          const isActuallyExpired = membership.endDate && new Date(membership.endDate) < currentDate;
          const actualStatus = isActuallyExpired ? 'expired' : membership.status;
          
          // Apply status filter - check actual expiration, not just stored status
          if (status && status !== 'all') {
            if (status === 'expired') {
              // For expired filter, only show actually expired memberships
              if (!isActuallyExpired) return;
            } else if (status === 'active') {
              // For active filter, only show non-expired active memberships
              if (isActuallyExpired || membership.status !== 'active') return;
            } else {
              // For other statuses (cancelled), check stored status
              if (membership.status !== status) return;
            }
          }
          
          if (membershipType && membership.membershipType !== membershipType) return;
          if (search) {
            const searchLower = search.toLowerCase();
            const matchesUser = 
              (user.name && user.name.toLowerCase().includes(searchLower)) ||
              (user.email && user.email.toLowerCase().includes(searchLower)) ||
              (membership.packageId?.name && membership.packageId.name.toLowerCase().includes(searchLower));
            if (!matchesUser) return;
          }

          allMemberships.push({
            _id: membership._id,
            userId: user._id,
            userName: user.name || user.email,
            userEmail: user.email,
            userRole: user.role,
            packageId: membership.packageId?._id,
            packageName: membership.packageId?.name || 'N/A',
            membershipType: membership.membershipType,
            status: actualStatus, // Use actual status based on expiration
            startDate: membership.startDate,
            endDate: membership.endDate,
            createdAt: membership.createdAt || user.createdAt
          });
        });
      }
    });

    // Sort by creation date
    allMemberships.sort((a, b) => {
      const dateA = new Date(a.createdAt);
      const dateB = new Date(b.createdAt);
      return dateB - dateA;
    });

    res.json(allMemberships);
  } catch (error) {
    console.error('Error fetching memberships:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', authenticateToken, checkPermission('users'), async (req, res) => {
  try {
    const { segment, membershipStatus, search } = req.query;
    
    // Filter by segment (B2C, B2B, B2E)
    if (segment === 'B2C') {
      const query = { role: 'b2c_user' };
      
      if (membershipStatus) {
        query['memberships.status'] = membershipStatus;
      }
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const users = await User.find(query)
        .populate('memberships.packageId', 'name')
        .sort({ createdAt: -1 });
      res.json(users);
    } else if (segment === 'B2B' || segment === 'B2E') {
      // For B2B/B2E, get users from both User model (with role) and OrgUser model
      const userQuery = {};
      if (segment === 'B2B') {
        userQuery.role = 'b2b_user';
      } else {
        userQuery.role = 'b2e_user';
      }
      
      if (search) {
        userQuery.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      // Get users with role
      const usersWithRole = await User.find(userQuery)
        .populate('memberships.packageId', 'name')
        .sort({ createdAt: -1 });

      // Get users from OrgUser
      const orgUsers = await OrgUser.find({ segment })
        .populate('userId', 'name email lastLogin')
        .populate('organizationId', 'name segment')
        .sort({ createdAt: -1 });

      // Combine and format
      const formattedOrgUsers = orgUsers.map(orgUser => ({
        _id: orgUser.userId._id,
        name: orgUser.userId.name,
        email: orgUser.userId.email,
        role: segment === 'B2B' ? 'b2b_user' : 'b2e_user',
        lastLogin: orgUser.userId.lastLogin,
        organizationId: orgUser.organizationId,
        organizationName: orgUser.organizationId?.name,
        segment: orgUser.segment,
        memberships: [], // OrgUsers have custom packages, not regular memberships
        createdAt: orgUser.createdAt
      }));

      // Combine both arrays
      const allUsers = [...usersWithRole, ...formattedOrgUsers];
      
      // Remove duplicates based on _id
      const uniqueUsers = allUsers.filter((user, index, self) =>
        index === self.findIndex(u => u._id.toString() === user._id.toString())
      );

      res.json(uniqueUsers);
    } else {
      // Default to B2C if no segment specified
      const query = { role: 'b2c_user' };
      
      if (membershipStatus) {
        query['memberships.status'] = membershipStatus;
      }
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const users = await User.find(query)
        .populate('memberships.packageId', 'name')
        .sort({ createdAt: -1 });
      res.json(users);
    }
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authenticateToken, checkPermission('users'), async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId);
    if (!currentUser) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Ensure id is a string, not an object
    const userId = extractId(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }
    
    const user = await User.findById(userId)
      .populate('memberships.packageId')
      .populate('progress.cardProgress.cardId')
      .populate('progress.packageProgress.packageId')
      .populate('organizationId', 'name uniqueCode type ownerId')
      .populate('schoolId', 'name uniqueCode type ownerId');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isAdmin = currentUser.role === 'admin';
    const isOwnerRole = currentUser.role === 'b2b_user' || currentUser.role === 'b2e_user';

    const ownsOrg = user.organizationId && user.organizationId.ownerId && user.organizationId.ownerId.toString() === currentUser._id.toString();
    const ownsSchool = user.schoolId && user.schoolId.ownerId && user.schoolId.ownerId.toString() === currentUser._id.toString();

    const sameOrg = user.organizationId && currentUser.organizationId && user.organizationId._id.toString() === currentUser.organizationId.toString();
    const sameSchool = user.schoolId && currentUser.schoolId && user.schoolId._id.toString() === currentUser.schoolId.toString();

    const isOwner = isOwnerRole && (ownsOrg || ownsSchool || sameOrg || sameSchool);

    if (!isAdmin && !isOwner && currentUser._id.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'You do not have permission to view this user' });
    }

    const transactions = await Transaction.find({ userId: userId })
      .populate('packageId', 'name')
      .sort({ createdAt: -1 });

    // Return user data with proper structure
    const userData = user.toObject();
    res.json({
      ...userData,
      transactions
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticateToken, checkPermission('users'), async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Ensure id is a string, not an object
    let userId = extractId(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }
    if (typeof userId === 'object' && userId !== null) {
      userId = userId._id || userId.id || (userId.toString && userId.toString() !== '[object Object]' ? userId.toString() : null);
    }
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }
    userId = userId.toString().trim();
    
    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Terminate member membership (remove from organization/school)
router.delete('/:id/membership', authenticateToken, async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Ensure id is a string, not an object
    const memberId = extractId(req.params.id);
    if (!memberId) {
      return res.status(400).json({ error: 'Invalid member ID format' });
    }
    
    const member = await User.findById(memberId);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Check if current user owns the organization/school
    let isOwner = false;
    if (currentUser.organizationId && member.organizationId) {
      const organization = await Organization.findOne({ _id: currentUser.organizationId, ownerId: currentUser._id });
      isOwner = !!organization && organization._id.toString() === member.organizationId.toString();
    }
    
    if (!isOwner && currentUser.schoolId && member.schoolId) {
      const school = await School.findOne({ _id: currentUser.schoolId, ownerId: currentUser._id });
      isOwner = !!school && school._id.toString() === member.schoolId.toString();
    }

    if (!isOwner && currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'You are not authorized to remove this member' });
    }

    // Get organization/school name before removing
    let organizationName = null;
    let schoolName = null;
    
    if (member.organizationId) {
      const org = await Organization.findById(member.organizationId);
      organizationName = org?.name || null;
    }
    
    if (member.schoolId) {
      const school = await School.findById(member.schoolId);
      schoolName = school?.name || null;
    }

    // Remove member from organization/school
    member.organizationId = null;
    member.schoolId = null;
    member.memberStatus = 'rejected';
    await member.save();

    // Delete OrgUser record if exists
    await OrgUser.deleteMany({ userId: member._id });

    // Send termination email
    try {
      const { sendMembershipTerminationEmail } = require('../utils/emailService');
      await sendMembershipTerminationEmail(member, organizationName, schoolName);
    } catch (emailError) {
      console.error('Error sending termination email:', emailError);
      // Don't fail the request if email fails
    }

    res.json({ message: 'Member membership terminated successfully. The member has been notified via email.' });
  } catch (error) {
    console.error('Error terminating membership:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, checkPermission('users'), async (req, res) => {
  try {
    // Ensure id is a string, not an object
    const userId = extractId(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }
    
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete related transactions
    await Transaction.deleteMany({ userId: userId });

    // Delete OrgUser records if user is part of organization
    await OrgUser.deleteMany({ userId: userId });

    // Delete the user
    await User.findByIdAndDelete(userId);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

