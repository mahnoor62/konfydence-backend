const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const OrgUser = require('../models/OrgUser');
const Organization = require('../models/Organization');

const router = express.Router();

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
    const user = await User.findById(req.params.id)
      .populate('memberships.packageId')
      .populate('progress.cardProgress.cardId')
      .populate('progress.packageProgress.packageId');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const transactions = await Transaction.find({ userId: req.params.id })
      .populate('packageId', 'name')
      .sort({ createdAt: -1 });

    res.json({
      user,
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

    const user = await User.findByIdAndUpdate(
      req.params.id,
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

router.delete('/:id', authenticateToken, checkPermission('users'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete related transactions
    await Transaction.deleteMany({ userId: req.params.id });

    // Delete OrgUser records if user is part of organization
    await OrgUser.deleteMany({ userId: req.params.id });

    // Delete the user
    await User.findByIdAndDelete(req.params.id);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

