const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Package = require('../models/Package');

const router = express.Router();

router.get('/b2c', authenticateToken, checkPermission('transactions'), async (req, res) => {
  try {
    const { status, dateFrom, dateTo, packageId } = req.query;
    const query = {
      type: { $in: ['b2c_purchase', 'b2c_renewal'] }
    };

    if (status) query.status = status;
    if (packageId) query.packageId = packageId;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const transactions = await Transaction.find(query)
      .populate('userId', 'name email')
      .populate('packageId', 'name')
      .sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching B2C transactions:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/b2b-b2e', authenticateToken, checkPermission('transactions'), async (req, res) => {
  try {
    const { organizationId, status } = req.query;
    const query = {
      type: { $in: ['b2b_contract', 'b2e_contract'] }
    };

    if (organizationId) query.organizationId = organizationId;
    if (status) query.status = status;

    const transactions = await Transaction.find(query)
      .populate('organizationId', 'name segment')
      .populate('customPackageId')
      .sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching B2B/B2E contracts:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all transactions (must be before /:id route to avoid route conflict)
router.get('/all', authenticateToken, checkPermission('transactions'), async (req, res) => {
  try {
    const { type, status } = req.query;
    const query = {};

    if (type && type !== 'all') {
      query.type = type;
    }
    if (status) {
      query.status = status;
    }

    const transactions = await Transaction.find(query)
      .populate('userId', 'name email')
      .populate('packageId', 'name')
      .populate('organizationId', 'name segment')
      .populate('customPackageId')
      .sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching all transactions:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/',
  authenticateToken,
  checkPermission('transactions'),
  [
    body('type').isIn(['b2c_purchase', 'b2c_renewal', 'b2b_contract', 'b2e_contract']),
    body('amount').isNumeric()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // If packageId is provided but packageType is not, fetch package to get its type
      let transactionData = { ...req.body };
      if (transactionData.packageId && !transactionData.packageType) {
        const package = await Package.findById(transactionData.packageId);
        if (package) {
          transactionData.packageType = package.packageType || package.type || 'standard';
        }
      }

      const transaction = await Transaction.create(transactionData);

      // Handle membership for all transaction types (b2c, b2b, b2e)
      if (transaction.userId && transaction.packageId) {
        const user = await User.findById(transaction.userId);
        const package = await Package.findById(transaction.packageId);
        
        // Fetch product if productId is provided
        let product = null;
        if (transaction.productId) {
          const Product = require('../models/Product');
          product = await Product.findById(transaction.productId);
        }
        
        if (user && package) {
          // Convert product targetAudience to package targetAudiences format
          const convertProductTargetAudienceToPackage = (targetAudience) => {
            if (!targetAudience) return null;
            const mapping = {
              'private-users': 'B2C',
              'businesses': 'B2B',
              'schools': 'B2E'
            };
            return mapping[targetAudience] || null;
          };

          // Determine membership type based on package targetAudiences or product targetAudience
          let targetAudiences = null;
          
          // Priority: Check package targetAudiences first
          if (package && package.targetAudiences && Array.isArray(package.targetAudiences)) {
            targetAudiences = package.targetAudiences;
          }
          // Fallback: Check product targetAudience if package doesn't have it
          else if (product && product.targetAudience) {
            const converted = convertProductTargetAudienceToPackage(product.targetAudience);
            targetAudiences = converted ? [converted] : null;
          }
          
          let membershipType = 'b2c'; // Default
          if (targetAudiences && targetAudiences.length > 0) {
            // Priority: B2B > B2E > B2C
            if (targetAudiences.includes('B2B')) {
              membershipType = 'b2b';
            } else if (targetAudiences.includes('B2E')) {
              membershipType = 'b2e';
            } else if (targetAudiences.includes('B2C')) {
              membershipType = 'b2c';
            }
          }
          
          const existingMembership = user.memberships.find(
            m => m.packageId.toString() === transaction.packageId.toString()
          );

          if (existingMembership) {
            existingMembership.status = 'active';
            existingMembership.membershipType = membershipType; // Update membership type if changed
            existingMembership.endDate = transaction.contractPeriod?.endDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
          } else {
            user.memberships.push({
              packageId: transaction.packageId,
              membershipType: membershipType,
              status: 'active',
              startDate: transaction.contractPeriod?.startDate || new Date(),
              endDate: transaction.contractPeriod?.endDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
            });
          }
          await user.save();
        }
      }

      res.status(201).json(transaction);
    } catch (error) {
      console.error('Error creating transaction:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    // Check if id is a valid ObjectId format (24 hex characters)
    const { id } = req.params;
    if (!id || id.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({ error: 'Invalid transaction ID format' });
    }

    const transaction = await Transaction.findById(id)
      .populate('packageId', 'name')
      .populate('userId', 'name email');

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Check if user owns this transaction
    if (transaction.userId && transaction.userId._id.toString() !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(transaction);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticateToken, checkPermission('transactions'), async (req, res) => {
  try {
    const transaction = await Transaction.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(transaction);
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, checkPermission('transactions'), async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    await Transaction.findByIdAndDelete(req.params.id);
    res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

