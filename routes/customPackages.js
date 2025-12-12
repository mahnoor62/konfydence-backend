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

router.get('/', authenticateToken, checkPermission('organizations'), async (req, res) => {
  try {
    const { organizationId } = req.query;
    const query = {};
    if (organizationId) query.organizationId = organizationId;

    const customPackages = await CustomPackage.find(query)
      .populate('basePackageId', 'name description')
      .populate('organizationId', 'name segment')
      .populate('effectiveCardIds', 'title category')
      .sort({ createdAt: -1 });
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
      .populate('effectiveCardIds')
      .populate('addedCardIds')
      .populate('removedCardIds');
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
    body('organizationId').notEmpty(),
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

      const organization = await Organization.findById(req.body.organizationId);
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const customPackage = await CustomPackage.create({
        ...req.body,
        name: req.body.name || basePackage.name,
        description: req.body.description || basePackage.description
      });

      await customPackage.save();

      // Check if package already exists in organization to prevent duplicates
      if (!organization.customPackages.includes(customPackage._id)) {
        organization.customPackages.push(customPackage._id);
        await organization.save();
      }

      const populated = await CustomPackage.findById(customPackage._id)
        .populate('basePackageId')
        .populate('organizationId')
        .populate('effectiveCardIds')
        .populate('addedCardIds')
        .populate('removedCardIds');

      // Send email notification if this package was created from a request
      // Check if there's a related custom package request
      try {
        const relatedRequest = await CustomPackageRequest.findOne({
          organizationName: organization.name,
          contactEmail: organization.primaryContact?.email?.toLowerCase(),
          status: { $in: ['pending', 'reviewing', 'approved'] }
        })
          .populate('basePackageId')
          .sort({ createdAt: -1 })
          .limit(1);

        if (relatedRequest) {
          // Send email with package details
          await sendCustomPackageCreatedEmail(relatedRequest, populated);
        }
      } catch (emailError) {
        console.error('Error sending custom package creation email:', emailError);
        // Don't fail the request if email fails
      }

      res.status(201).json(populated);
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
        .populate('effectiveCardIds');

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

