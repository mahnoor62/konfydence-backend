const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Organization = require('../models/Organization');
const School = require('../models/School');
const Package = require('../models/Package');
const CustomPackage = require('../models/CustomPackage');
const Product = require('../models/Product');

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

// New endpoint: Get all packages and transactions for admin's organization/school
router.get('/admin/packages', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Get admin user with organization/school info
    const user = await User.findById(userId)
      .populate('organizationId')
      .populate('schoolId');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Determine organization/school ID
    let organizationId = null;
    let schoolId = null;
    
    // Check if user is owner of organization/school
    if (user.ownerId) {
      const ownerOrg = await Organization.findOne({ ownerId: userId });
      const ownerSchool = await School.findOne({ ownerId: userId });
      if (ownerOrg) organizationId = ownerOrg._id;
      if (ownerSchool) schoolId = ownerSchool._id;
    }
    
    // Fallback to user's direct organization/school
    if (!organizationId && user.organizationId) {
      organizationId = typeof user.organizationId === 'object' 
        ? user.organizationId._id 
        : user.organizationId;
    }
    if (!schoolId && user.schoolId) {
      schoolId = typeof user.schoolId === 'object' 
        ? user.schoolId._id 
        : user.schoolId;
    }
    
    // Build query for transactions
    // IMPORTANT: Always filter by userId - user can only see their own transactions
    const transactionQuery = {
      type: { $in: ['b2b_contract', 'b2e_contract'] },
      userId: userId // Always filter by logged-in user's ID
    };
    
    // Also filter by organizationId/schoolId if user belongs to that organization/school
    if (organizationId) {
      // Verify that the organizationId matches user's organization
      const userOrgId = user.organizationId ? (typeof user.organizationId === 'object' ? user.organizationId._id : user.organizationId).toString() : null;
      const requestedOrgId = organizationId.toString();
      
      if (userOrgId === requestedOrgId) {
        transactionQuery.organizationId = organizationId;
      }
      // If organizationId doesn't match, query will only return user's transactions (userId filter already applied)
    }
    
    if (schoolId) {
      // Verify that the schoolId matches user's school
      const userSchoolId = user.schoolId ? (typeof user.schoolId === 'object' ? user.schoolId._id : user.schoolId).toString() : null;
      const requestedSchoolId = schoolId.toString();
      
      if (userSchoolId === requestedSchoolId) {
        transactionQuery.schoolId = schoolId;
      }
      // If schoolId doesn't match, query will only return user's transactions (userId filter already applied)
    }
    
    // Fetch ALL transactions with COMPLETE population
    // Don't use lean() initially to ensure populate works correctly
    const transactions = await Transaction.find(transactionQuery)
      .populate({
        path: 'packageId',
        model: 'Package'
        // Get ALL fields - don't restrict with select
      })
      .populate({
        path: 'customPackageId',
        model: 'CustomPackage',
        populate: {
          path: 'basePackageId',
          model: 'Package'
        }
      })
      .populate({
        path: 'userId',
        model: 'User',
        select: 'name email role schoolId organizationId _id'
      })
      .populate({
        path: 'organizationId',
        model: 'Organization'
      })
      .populate({
        path: 'schoolId',
        model: 'School'
      })
      .populate({
        path: 'productId',
        model: 'Product'
      })
      .populate({
        path: 'gamePlays.userId',
        model: 'User',
        select: 'name email _id'
      })
      .populate({
        path: 'referrals.referredUserId',
        model: 'User',
        select: 'name email _id'
      })
      .sort({ createdAt: -1 });
    
    // Convert to plain objects and ensure ALL fields are included
    const enrichedTransactions = transactions.map(tx => {
      // Convert Mongoose document to plain object
      const txObj = tx.toObject ? tx.toObject() : tx;
      
      // Ensure ALL transaction fields are explicitly included
      return {
        _id: txObj._id,
        id: txObj._id, // Add id field for frontend compatibility
        type: txObj.type,
        userId: txObj.userId,
        organizationId: txObj.organizationId,
        schoolId: txObj.schoolId,
        packageId: txObj.packageId, // FULLY populated package object with ALL fields
        packageType: txObj.packageType,
        productId: txObj.productId,
        customPackageId: txObj.customPackageId,
        amount: txObj.amount,
        currency: txObj.currency,
        status: txObj.status,
        providerRef: txObj.providerRef,
        uniqueCode: txObj.uniqueCode, // Unique code for game play
        stripePaymentIntentId: txObj.stripePaymentIntentId,
        contractPeriod: txObj.contractPeriod || {
          startDate: txObj.createdAt,
          endDate: null
        },
        maxSeats: txObj.maxSeats,
        usedSeats: txObj.usedSeats,
        codeApplications: txObj.codeApplications,
        gamePlays: txObj.gamePlays || [], // Array with populated userId
        referrals: txObj.referrals || [], // Array with populated referredUserId
        createdAt: txObj.createdAt,
        updatedAt: txObj.updatedAt,
        __v: txObj.__v
      };
    });
    
    // Get organization/school data if exists
    let organization = null;
    let school = null;
    
    if (organizationId) {
      organization = await Organization.findById(organizationId)
        .populate('transactionIds')
        .populate('members')
        .lean();
    }
    
    if (schoolId) {
      school = await School.findById(schoolId)
        .populate('transactionIds')
        .populate('students')
        .populate({
          path: 'customPackages',
          populate: {
            path: 'basePackageId',
            model: 'Package'
          }
        })
        .lean();
    }
    
    // Custom packages are now only returned via transactions (after purchase)
    // Only purchased custom packages (with transactions) should appear on dashboard
    // Return complete data
    res.json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: organizationId,
        schoolId: schoolId
      },
      organization: organization,
      school: school,
      transactions: enrichedTransactions, // ALL transaction data with FULL population (includes custom packages if purchased)
      customPackages: [], // Empty - custom packages only show via transactions
      count: enrichedTransactions.length
    });
  } catch (error) {
    console.error('Error fetching admin packages:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

router.get('/b2b-b2e', authenticateToken, checkPermission('transactions'), async (req, res) => {
  try {
    const { organizationId, schoolId, status } = req.query;
    
    const query = {
      type: { $in: ['b2b_contract', 'b2e_contract'] }
    };

    // Note: checkPermission('transactions') middleware ensures only admin can access
    // Admin should see ALL B2B/B2E contracts, not just their own
    // So we DON'T filter by userId for admin
    
    // Filter by organizationId if provided
    if (organizationId) {
      query.organizationId = organizationId;
    }
    
    // Filter by schoolId if provided
    if (schoolId) {
      query.schoolId = schoolId;
    }
    
    if (status) query.status = status;

    const transactions = await Transaction.find(query)
      .populate({
        path: 'organizationId',
        model: 'Organization',
        select: '-__v'
      })
      .populate({
        path: 'schoolId',
        model: 'School',
        select: '-__v'
      })
      .populate({
        path: 'packageId',
        model: 'Package',
        // Get ALL fields from Package: name, description, type, packageType, category, 
        // pricing, targetAudiences, visibility, status, maxSeats, expiryDate, includedCardIds
        select: 'name description type packageType category pricing targetAudiences visibility status maxSeats expiryDate includedCardIds createdAt updatedAt'
      })
      .populate({
        path: 'customPackageId',
        model: 'CustomPackage',
        select: '-__v',
        populate: [
          {
            path: 'basePackageId',
            model: 'Package',
            select: 'name description'
          },
          {
            path: 'productIds',
            model: 'Product',
            select: 'name description price'
          },
          {
            path: 'organizationId',
            model: 'Organization',
            select: 'name segment'
          },
          {
            path: 'schoolId',
            model: 'School',
            select: 'name'
          }
        ]
      })
      .populate({
        path: 'userId',
        model: 'User',
        select: 'name email role schoolId organizationId _id'
      })
      .populate({
        path: 'productId',
        model: 'Product',
        select: '-__v'
      })
      .populate({
        path: 'gamePlays.userId',
        model: 'User',
        select: 'name email _id'
      })
      .populate({
        path: 'referrals.referredUserId',
        model: 'User',
        select: 'name email _id'
      })
      .sort({ createdAt: -1 })
      .lean();
    
    // Ensure all transaction fields are included and add id field
    const enrichedTransactions = transactions.map(tx => ({
      ...tx,
      id: tx._id // Add id field for frontend compatibility
    }));
    
    res.json(enrichedTransactions);
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
      .populate('userId') // Populate ALL fields from User
      .populate('packageId') // Populate ALL fields from Package table
      .populate('customPackageId') // Populate ALL fields from CustomPackage
      .populate('organizationId') // Populate ALL fields from Organization
      .populate('schoolId') // Populate ALL fields from School
      .populate('productId') // Populate ALL fields from Product
      .populate('gamePlays.userId') // Populate ALL fields from User in gamePlays
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
      .populate({
        path: 'packageId',
        model: 'Package'
        // Get ALL fields - don't restrict with select
      })
      .populate({
        path: 'customPackageId',
        model: 'CustomPackage'
      })
      .populate({
        path: 'userId',
        model: 'User',
        select: 'name email role schoolId organizationId _id'
      })
      .populate({
        path: 'organizationId',
        model: 'Organization'
      })
      .populate({
        path: 'schoolId',
        model: 'School'
      })
      .populate({
        path: 'productId',
        model: 'Product'
      })
      .populate({
        path: 'gamePlays.userId',
        model: 'User',
        select: 'name email _id'
      })
      .populate({
        path: 'referrals.referredUserId',
        model: 'User',
        select: 'name email _id'
      });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Convert to plain object and ensure ALL fields are included
    const txObj = transaction.toObject ? transaction.toObject() : transaction;
    
    // Build complete transaction object with ALL fields
    const completeTransaction = {
      _id: txObj._id,
      id: txObj._id, // Add id field for frontend compatibility
      type: txObj.type,
      userId: txObj.userId,
      organizationId: txObj.organizationId,
      schoolId: txObj.schoolId,
      packageId: txObj.packageId, // FULLY populated package object with ALL fields
      packageType: txObj.packageType,
      productId: txObj.productId,
      customPackageId: txObj.customPackageId,
      amount: txObj.amount,
      currency: txObj.currency,
      status: txObj.status,
      providerRef: txObj.providerRef,
      uniqueCode: txObj.uniqueCode, // Unique code for game play
      stripePaymentIntentId: txObj.stripePaymentIntentId,
      contractPeriod: txObj.contractPeriod || {
        startDate: txObj.createdAt,
        endDate: null
      },
      maxSeats: txObj.maxSeats,
      usedSeats: txObj.usedSeats,
      codeApplications: txObj.codeApplications,
      gamePlays: txObj.gamePlays || [],
      referrals: txObj.referrals || [],
      createdAt: txObj.createdAt,
      updatedAt: txObj.updatedAt,
      __v: txObj.__v
    };

    // Check if user owns this transaction
    if (completeTransaction.userId && completeTransaction.userId._id && completeTransaction.userId._id.toString() !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Return complete transaction with all populated data
    res.json(completeTransaction);
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

