const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const Organization = require('../models/Organization');
const School = require('../models/School');
const User = require('../models/User');

const router = express.Router();

// All routes here require authentication
router.use(authenticateToken);

// Get organizations / institutes for current user (owner)
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // B2B owner: return organizations they own
    if (user.role === 'b2b_user') {
      const organizations = await Organization.find({ ownerId: user._id })
        .select('name type customType uniqueCode status description primaryContact customPackages members createdAt')
        .sort({ createdAt: -1 });

      // For each organization, count approved members from User table
      // Members are stored in User table with organizationId field
      const mapped = await Promise.all(
        organizations.map(async (org) => {
          // Count actual members from User table who have this organizationId and approved status
          // First try with role filter
          let memberCount = await User.countDocuments({
            organizationId: org._id,
            role: { $in: ['b2b_member', 'b2e_member'] },
            memberStatus: 'approved',
          });
          
          // If no members found with role filter, try without role filter (just approved status)
          if (memberCount === 0) {
            memberCount = await User.countDocuments({
              organizationId: org._id,
              memberStatus: 'approved',
            });
          }
          
          // Get members array length from organization document (already loaded)
          const membersArrayLength = org.members?.length || 0;
          
          // Use the higher count: either from User table count or members array length
          // This ensures we show accurate count even if members array is updated but User table count is stale
          const finalMemberCount = Math.max(memberCount, membersArrayLength);

          return {
            _id: org._id,
            name: org.name,
            type: org.type,
            customType: org.customType,
            uniqueCode: org.uniqueCode,
            segment: 'B2B',
            status: org.status,
            description: org.description || '',
            primaryContact: org.primaryContact,
            customPackagesCount: org.customPackages?.length || 0,
            userCount: finalMemberCount,
            membersCount: finalMemberCount,
            members: org.members || [], // Include members array
            activeContractsCount: 0,
            createdAt: org.createdAt,
          };
        })
      );

      return res.json(mapped);
    }

    // B2E owner: return institutes (schools) they own, or the one linked via schoolId
    if (user.role === 'b2e_user') {
      const ownedSchools = await School.find({ ownerId: user._id })
        .select('name type customType uniqueCode status primaryContact customPackages students createdAt')
        .sort({ createdAt: -1 });
      const schools = [...ownedSchools];

      // Also include school linked to this user via schoolId (if different owner)
      if (user.schoolId) {
        const linkedSchool = await School.findById(user.schoolId)
          .select('name type customType uniqueCode status primaryContact customPackages students createdAt');
        if (linkedSchool && !schools.some((s) => s._id.toString() === linkedSchool._id.toString())) {
          schools.push(linkedSchool);
        }
      }

      // For each institute, count approved student members
      const mapped = await Promise.all(
        schools.map(async (school) => {
          const memberCount = await User.countDocuments({
            schoolId: school._id,
            role: { $in: ['b2b_member', 'b2e_member'] },
            memberStatus: 'approved',
          });

          // Get students array length from school document (already loaded)
          const studentsArrayLength = school.students?.length || 0;
          
          // Use the higher count: either from User table count or students array length
          const finalMemberCount = Math.max(memberCount, studentsArrayLength);

          return {
            _id: school._id,
            name: school.name,
            type: school.type,
            customType: school.customType,
            uniqueCode: school.uniqueCode,
            segment: 'B2E',
            status: school.status,
            description: '', // School schema currently has no description field
            primaryContact: school.primaryContact,
            customPackagesCount: school.customPackages?.length || 0,
            userCount: finalMemberCount,
            membersCount: finalMemberCount,
            students: school.students || [], // Include students array
            activeContractsCount: 0,
            createdAt: school.createdAt,
          };
        })
      );

      return res.json(mapped);
    }

    // Other roles do not own organizations / institutes
    return res.json([]);
  } catch (error) {
    console.error('Error fetching user organizations:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create organization / institute for current user
router.post('/', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { name, type, customType, segment, primaryContact } = req.body;

    if (!name || !type || !primaryContact?.name || !primaryContact?.email) {
      return res.status(400).json({ error: 'Name, type and primary contact are required' });
    }

    // B2B: create Organization (only one per owner)
    if (user.role === 'b2b_user') {
      const existingOrg = await Organization.findOne({ ownerId: user._id });
      if (existingOrg || user.organizationId) {
        return res.status(400).json({ error: 'You already have an organization. You can edit it but cannot create another one.' });
      }

      const organization = await Organization.create({
        name,
        type,
        customType,
        segment: segment || 'B2B',
        primaryContact,
        ownerId: user._id,
      });
      return res.status(201).json(organization);
    }

    // B2E: create School (Institute) - only one per owner
    if (user.role === 'b2e_user') {
      const existingSchool = await School.findOne({ ownerId: user._id });
      if (existingSchool || user.schoolId) {
        return res.status(400).json({ error: 'You already have an institute. You can edit it but cannot create another one.' });
      }

      const school = await School.create({
        name,
        type,
        customType,
        primaryContact,
        ownerId: user._id,
      });
      return res.status(201).json(school);
    }

    return res.status(403).json({ error: 'You are not allowed to create organizations or institutes' });
  } catch (error) {
    console.error('Error creating user organization/institute:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update organization / institute owned by current user
router.put('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { id } = req.params;
    const { name, type, customType, primaryContact } = req.body;

    let updated = null;

    if (user.role === 'b2b_user') {
      updated = await Organization.findOneAndUpdate(
        { _id: id, ownerId: user._id },
        { name, type, customType, primaryContact },
        { new: true, runValidators: true }
      );
    } else if (user.role === 'b2e_user') {
      updated = await School.findOneAndUpdate(
        { _id: id, ownerId: user._id },
        { name, type, customType, primaryContact },
        { new: true, runValidators: true }
      );
    }

    if (!updated) {
      return res.status(404).json({ error: 'Organization or institute not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating user organization/institute:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;


