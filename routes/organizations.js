const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const Organization = require('../models/Organization');
const OrgUser = require('../models/OrgUser');
const CustomPackage = require('../models/CustomPackage');

const router = express.Router();

router.get('/', authenticateToken, checkPermission('organizations'), async (req, res) => {
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

router.get('/:id', authenticateToken, checkPermission('organizations'), async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.id);

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

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

    const orgUsers = await OrgUser.find({ organizationId: req.params.id })
      .populate('userId', 'name email')
      .populate('assignedCustomPackageIds');

    res.json({
      organization,
      orgUsers
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
        return res.status(400).json({ errors: errors.array() });
      }

      const organization = await Organization.create(req.body);
      res.status(201).json(organization);
    } catch (error) {
      console.error('Error creating organization:', error);
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

