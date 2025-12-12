const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const Package = require('../models/Package');
const Card = require('../models/Card');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { status, visibility, search, targetAudience } = req.query;
    const query = {};

    if (status) query.status = status;
    if (visibility) query.visibility = visibility;
    if (targetAudience) {
      if (targetAudience === 'B2B_B2E') {
        // Show packages that have either B2B or B2E or both in targetAudiences
        query.targetAudiences = { $in: ['B2B', 'B2E'] };
      } else {
        // Filter packages that have the target audience in their targetAudiences array
        query.targetAudiences = { $in: [targetAudience] };
      }
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const packages = await Package.find(query)
      .populate('includedCardIds', 'title category')
      .sort({ updatedAt: -1 });
    res.json(packages);
  } catch (error) {
    console.error('Error fetching packages:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/public', async (req, res) => {
  try {
    const { targetAudience } = req.query;
    const query = {
      visibility: 'public',
      status: 'active',
      type: 'standard'
    };

    if (targetAudience) {
      if (targetAudience === 'B2B_B2E') {
        // Show packages that have either B2B or B2E or both in targetAudiences
        query.targetAudiences = { $in: ['B2B', 'B2E'] };
      } else {
        // Filter packages that have the target audience in their targetAudiences array
        query.targetAudiences = { $in: [targetAudience] };
      }
    }

    const packages = await Package.find(query)
      .populate('includedCardIds', 'title category')
      .sort({ createdAt: -1 });
    res.json(packages);
  } catch (error) {
    console.error('Error fetching public packages:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const package = await Package.findById(req.params.id)
      .populate('includedCardIds');
    if (!package) {
      return res.status(404).json({ error: 'Package not found' });
    }
    res.json(package);
  } catch (error) {
    console.error('Error fetching package:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/',
  authenticateToken,
  checkPermission('packages'),
  [
    body('name').notEmpty().trim(),
    body('description').notEmpty(),
    body('pricing.amount').isNumeric(),
    body('pricing.billingType').isIn(['one_time', 'subscription', 'per_seat'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const package = await Package.create(req.body);
      res.status(201).json(package);
    } catch (error) {
      console.error('Error creating package:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put(
  '/:id',
  authenticateToken,
  checkPermission('packages'),
  async (req, res) => {
    try {
      const package = await Package.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      ).populate('includedCardIds');

      if (!package) {
        return res.status(404).json({ error: 'Package not found' });
      }

      res.json(package);
    } catch (error) {
      console.error('Error updating package:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put('/:id/archive', authenticateToken, checkPermission('packages'), async (req, res) => {
  try {
    const package = await Package.findByIdAndUpdate(
      req.params.id,
      { status: 'archived' },
      { new: true }
    );
    if (!package) {
      return res.status(404).json({ error: 'Package not found' });
    }
    res.json({ message: 'Package archived successfully', package });
  } catch (error) {
    console.error('Error archiving package:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/unarchive', authenticateToken, checkPermission('packages'), async (req, res) => {
  try {
    const package = await Package.findByIdAndUpdate(
      req.params.id,
      { status: 'active' },
      { new: true }
    );
    if (!package) {
      return res.status(404).json({ error: 'Package not found' });
    }
    res.json({ message: 'Package unarchived successfully', package });
  } catch (error) {
    console.error('Error unarchiving package:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, checkPermission('packages'), async (req, res) => {
  try {
    const package = await Package.findByIdAndDelete(req.params.id);
    if (!package) {
      return res.status(404).json({ error: 'Package not found' });
    }
    res.json({ message: 'Package permanently deleted' });
  } catch (error) {
    console.error('Error deleting package:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Convert product targetAudience to package targetAudiences format
// Mapping: private-users → B2C, businesses → B2B, schools → B2E
const convertProductTargetAudienceToPackage = (targetAudience) => {
  if (!targetAudience) return null;
  
  const mapping = {
    'private-users': 'B2C',
    'businesses': 'B2B',
    'schools': 'B2E'
  };
  
  return mapping[targetAudience] || null;
};

// Determine transaction type based on package targetAudiences or product targetAudience
// Priority: Product targetAudience > Package targetAudiences (when product is provided)
const getTransactionType = (package, product = null) => {
  let targetAudiences = null;
  let source = 'none';
  
  // Priority: Check product targetAudience first if product is provided
  // This ensures product's targetAudience takes precedence over package
  if (product && product.targetAudience) {
    const converted = convertProductTargetAudienceToPackage(product.targetAudience);
    if (converted) {
      targetAudiences = [converted];
      source = 'product';
      console.log('✅ Using product targetAudience for transaction type:', {
        productId: product._id,
        productName: product.name,
        productTargetAudience: product.targetAudience,
        converted: converted,
        targetAudiences: targetAudiences
      });
    }
  }
  
  // Fallback: Check package targetAudiences if product doesn't have targetAudience
  if (!targetAudiences && package && package.targetAudiences && Array.isArray(package.targetAudiences)) {
    targetAudiences = package.targetAudiences;
    source = 'package';
    console.log('⚠️ Using package targetAudiences for transaction type (product not available or no targetAudience):', {
      packageId: package._id,
      packageName: package.name,
      packageTargetAudiences: package.targetAudiences,
      productId: product?._id,
      productTargetAudience: product?.targetAudience
    });
  }
  
  if (!targetAudiences || targetAudiences.length === 0) {
    // Default to b2c_purchase if no targetAudiences
    console.log('⚠️ No targetAudiences found for transaction type, defaulting to b2c_purchase');
    return 'b2c_purchase';
  }

  // Determine transaction type from targetAudiences
  // Note: When product targetAudience is used, it will be a single value array
  let transactionType = 'b2c_purchase';
  if (targetAudiences.includes('B2B')) {
    transactionType = 'b2b_contract';
  } else if (targetAudiences.includes('B2E')) {
    transactionType = 'b2e_contract';
  } else if (targetAudiences.includes('B2C')) {
    transactionType = 'b2c_purchase';
  }

  console.log('✅ Determined transaction type:', {
    source: source,
    targetAudiences: targetAudiences,
    transactionType: transactionType
  });

  return transactionType;
};

// Determine membership type based on package targetAudiences or product targetAudience
// Priority: Product targetAudience > Package targetAudiences (when product is provided)
const getMembershipType = (package, product = null) => {
  let targetAudiences = null;
  let source = 'none';
  
  // Priority: Check product targetAudience first if product is provided
  // This ensures product's targetAudience takes precedence over package
  if (product && product.targetAudience) {
    const converted = convertProductTargetAudienceToPackage(product.targetAudience);
    if (converted) {
      targetAudiences = [converted];
      source = 'product';
      console.log('✅ Using product targetAudience:', {
        productId: product._id,
        productName: product.name,
        productTargetAudience: product.targetAudience,
        converted: converted,
        targetAudiences: targetAudiences
      });
    }
  }
  
  // Fallback: Check package targetAudiences if product doesn't have targetAudience
  if (!targetAudiences && package && package.targetAudiences && Array.isArray(package.targetAudiences)) {
    targetAudiences = package.targetAudiences;
    source = 'package';
    console.log('⚠️ Using package targetAudiences (product not available or no targetAudience):', {
      packageId: package._id,
      packageName: package.name,
      packageTargetAudiences: package.targetAudiences,
      productId: product?._id,
      productTargetAudience: product?.targetAudience
    });
  }
  
  if (!targetAudiences || targetAudiences.length === 0) {
    // Default to b2c if no targetAudiences
    console.log('⚠️ No targetAudiences found, defaulting to b2c');
    return 'b2c';
  }

  // Determine membership type from targetAudiences
  // Note: When product targetAudience is used, it will be a single value array
  let membershipType = 'b2c';
  if (targetAudiences.includes('B2B')) {
    membershipType = 'b2b';
  } else if (targetAudiences.includes('B2E')) {
    membershipType = 'b2e';
  } else if (targetAudiences.includes('B2C')) {
    membershipType = 'b2c';
  }

  console.log('✅ Determined membership type:', {
    source: source,
    targetAudiences: targetAudiences,
    membershipType: membershipType
  });

  return membershipType;
};

// Purchase package (for B2C users)
router.post('/:id/purchase', authenticateToken, async (req, res) => {
  try {
    const package = await Package.findById(req.params.id);
    if (!package) {
      return res.status(404).json({ error: 'Package not found' });
    }

    if (package.status !== 'active' || package.visibility !== 'public') {
      return res.status(400).json({ error: 'Package is not available for purchase' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user already has this package
    const existingMembership = user.memberships.find(
      (m) => m.packageId.toString() === package._id.toString() && m.status === 'active'
    );

    if (existingMembership) {
      return res.status(400).json({ error: 'You already have an active membership for this package' });
    }

    // Fetch product if productId is provided
    const { productId } = req.body;
    let product = null;
    if (productId) {
      const Product = require('../models/Product');
      product = await Product.findById(productId);
    }

    // Determine transaction type based on package targetAudiences or product targetAudience
    const transactionType = getTransactionType(package, product);

    // Determine membership type based on package targetAudiences or product targetAudience
    const membershipType = getMembershipType(package, product);

    // Get package type (prefer packageType, fallback to type)
    const packageType = package.packageType || package.type || 'standard';

    // Create transaction
    const transaction = await Transaction.create({
      type: transactionType,
      userId: req.userId,
      packageId: package._id,
      packageType: packageType,
      productId: productId || null,
      amount: package.pricing.amount,
      currency: package.pricing.currency || 'EUR',
      status: 'paid', // In production, this would be set after payment confirmation
      maxSeats: package.maxSeats || 5, // Get from package, default to 5 if not set
      usedSeats: 0,
      codeApplications: 0,
      gamePlays: [],
      referrals: [],
      contractPeriod: {
        startDate: new Date(),
        endDate: package.expiryDate
          ? new Date(package.expiryDate)
          : (package.pricing.billingType === 'subscription'
            ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year for subscription
            : null), // One-time purchases don't expire if no expiryDate set
      },
    });

    // Determine membership end date - use package expiryDate if available, otherwise use contractPeriod.endDate
    let membershipEndDate = transaction.contractPeriod.endDate;
    if (package.expiryDate) {
      // If package has expiryDate, use it
      membershipEndDate = new Date(package.expiryDate);
    }

    // Add membership to user
    user.memberships.push({
      packageId: package._id,
      membershipType: membershipType,
      status: 'active',
      startDate: new Date(),
      endDate: membershipEndDate,
    });

    await user.save();

    res.status(201).json({
      message: 'Package purchased successfully',
      transaction,
      membership: user.memberships[user.memberships.length - 1],
    });
  } catch (error) {
    console.error('Error purchasing package:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

