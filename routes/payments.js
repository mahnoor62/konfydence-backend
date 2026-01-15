const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const Package = require('../models/Package');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const FreeTrial = require('../models/FreeTrial');
const { sendTransactionSuccessEmail } = require('../utils/emailService');

const router = express.Router();

// Initialize Stripe only if key is provided
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  const stripeLib = require('stripe');
  stripe = stripeLib(process.env.STRIPE_SECRET_KEY);
}

// Check if Stripe is configured
const isStripeConfigured = () => {
  return stripe !== null && process.env.STRIPE_SECRET_KEY;
};

// Generate unique code in format: 4573-DTE2-R232 (4 digits - 3 letters + 1 digit - 1 letter + 3 digits)
const generateUniqueCode = () => {
  const getRandomDigits = (length) => {
    return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
  };
  
  const getRandomLetters = (length) => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return Array.from({ length }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  };
  
  const part1 = getRandomDigits(4); // 4 digits
  const part2 = getRandomLetters(3) + getRandomDigits(1); // 3 letters + 1 digit
  const part3 = getRandomLetters(1) + getRandomDigits(3); // 1 letter + 3 digits
  
  return `${part1}-${part2}-${part3}`;
};

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

// Calculate expiry date from package expiryTime and expiryTimeUnit
// Returns null if no expiry time is set
// Expiry date is calculated from purchase date + expiry time
const calculateExpiryDate = (package, startDate = new Date()) => {
  if (!package) return null;
  
  // Calculate expiry date from expiryTime and expiryTimeUnit
  if (package.expiryTime && package.expiryTimeUnit) {
    const expiryDate = new Date(startDate);
    if (package.expiryTimeUnit === 'months') {
      expiryDate.setMonth(expiryDate.getMonth() + package.expiryTime);
    } else if (package.expiryTimeUnit === 'years') {
      expiryDate.setFullYear(expiryDate.getFullYear() + package.expiryTime);
    }
    return expiryDate;
  }
  
  return null;
};

/**
 * Resolve userId from checkout session or payment intent
 * This is the SAME logic used in fallback flow (transaction-by-session endpoint)
 * Priority order:
 * 1. session.metadata.userId (primary source - set during checkout creation)
 * 2. paymentIntent.metadata.userId (if payment intent provided)
 * 3. session.customer_email → find user by email
 * 4. paymentIntent.receipt_email → find user by email
 * 5. Stripe customer email → find user by email
 * 
 * @param {Object} session - Stripe checkout session
 * @param {Object} paymentIntent - Optional Stripe payment intent
 * @param {Object} stripe - Stripe instance
 * @returns {Promise<{userId: string|null, source: string, user: Object|null}>}
 */
const resolveUserIdFromCheckout = async (session, paymentIntent = null, stripe = null) => {
  let userId = null;
  let source = 'none';
  let user = null;

  // Priority 1: session.metadata.userId (PRIMARY - set during checkout creation from req.userId)
  if (session?.metadata?.userId) {
    userId = session.metadata.userId;
    source = 'session.metadata.userId';
    console.log('✅ resolveUserIdFromCheckout: Found userId from session.metadata.userId', {
      userId,
      source,
      sessionId: session.id
    });
  }
  // Priority 2: paymentIntent.metadata.userId (if payment intent provided)
  else if (paymentIntent?.metadata?.userId) {
    userId = paymentIntent.metadata.userId;
    source = 'paymentIntent.metadata.userId';
    console.log('✅ resolveUserIdFromCheckout: Found userId from paymentIntent.metadata.userId', {
      userId,
      source,
      paymentIntentId: paymentIntent.id
    });
  }
  // Priority 3: session.customer_email → find user by email
  else if (session?.customer_email) {
    user = await User.findOne({ email: session.customer_email });
    if (user) {
      userId = user._id.toString();
      source = 'session.customer_email';
      console.log('✅ resolveUserIdFromCheckout: Found userId from session.customer_email', {
        userId,
        source,
        email: session.customer_email,
        sessionId: session.id
      });
    }
  }
  // Priority 4: paymentIntent.receipt_email → find user by email
  else if (paymentIntent?.receipt_email) {
    user = await User.findOne({ email: paymentIntent.receipt_email });
    if (user) {
      userId = user._id.toString();
      source = 'paymentIntent.receipt_email';
      console.log('✅ resolveUserIdFromCheckout: Found userId from paymentIntent.receipt_email', {
        userId,
        source,
        email: paymentIntent.receipt_email,
        paymentIntentId: paymentIntent.id
      });
    }
  }
  // Priority 5: Stripe customer email → find user by email
  else if (session?.customer && stripe) {
    try {
      const customer = await stripe.customers.retrieve(session.customer);
      if (customer?.email) {
        user = await User.findOne({ email: customer.email });
        if (user) {
          userId = user._id.toString();
          source = 'stripe.customer.email';
          console.log('✅ resolveUserIdFromCheckout: Found userId from Stripe customer email', {
            userId,
            source,
            customerId: session.customer,
            email: customer.email
          });
        }
      }
    } catch (err) {
      console.warn('⚠️ resolveUserIdFromCheckout: Could not retrieve Stripe customer:', err.message);
    }
  }

  // If we found userId but don't have user object, fetch it
  if (userId && !user) {
    try {
      // Try to find user by ID - handle both string and ObjectId
      user = await User.findById(userId);
      if (!user) {
        // If not found, try to find by email as fallback
        console.warn('⚠️ resolveUserIdFromCheckout: User not found by ID, trying email fallback...', {
          userId,
          source
        });
        // If we have email from session, try that
        if (session?.customer_email) {
          user = await User.findOne({ email: session.customer_email });
          if (user) {
            console.log('✅ resolveUserIdFromCheckout: Found user by email fallback after ID lookup failed', {
              userId: user._id.toString(),
              email: session.customer_email,
              originalUserId: userId
            });
            userId = user._id.toString();
            source = source + ' → email_fallback';
          }
        }
      } else {
        console.log('✅ resolveUserIdFromCheckout: Successfully fetched user by ID', {
          userId: user._id.toString(),
          email: user.email,
          source
        });
      }
    } catch (err) {
      console.error('❌ resolveUserIdFromCheckout: Error fetching user by ID:', {
        error: err.message,
        userId,
        source
      });
      user = null;
    }
  }

  return { userId, source, user };
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

// Helper function to set endDate to end of day (23:59:59.999)
const setEndOfDay = (date) => {
  if (!date) return null;
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

// Helper function to check if a date is at midnight (00:00:00)
const isMidnight = (date) => {
  if (!date) return false;
  const d = new Date(date);
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
};

// Helper function to check if transaction has expired
// Handles both end-of-day endDate (23:59:59.999) and midnight endDate (00:00:00) for backward compatibility
const isTransactionExpired = (endDate) => {
  if (!endDate) return false;
  const now = new Date();
  const expiry = new Date(endDate);
  
  // If endDate is at midnight, treat it as end of that day
  // Compare date parts only (YYYY-MM-DD) - code is valid until end of expiration day
  if (isMidnight(expiry)) {
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const expiryDate = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
    return nowDate > expiryDate; // Expired if current date is after expiration date
  }
  
  // For end-of-day endDate, use normal comparison
  return now > expiry;
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

// Create Stripe Checkout Session
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(500).json({ error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables.' });
    }

    const { packageId, productId, customPackageId, urlType, directProductPurchase } = req.body;
    
    // Allow direct product purchase (for physical products) without package
    if (!packageId && !customPackageId && !directProductPurchase) {
      return res.status(400).json({ error: 'Package ID, Custom Package ID, or direct product purchase is required' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate user role and product/package compatibility
    const Product = require('../models/Product');
    let product = null;
    if (productId) {
      product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      // For direct product purchases, ensure product is valid
      if (directProductPurchase && (!product.price || product.price <= 0)) {
        return res.status(400).json({ error: 'Product price is invalid' });
      }
      
      const userRole = user.role;
      
      // Check if URL type matches user role - if yes, skip product category validation
      let urlTypeMatchesRole = false;
      if (urlType === 'B2B' && (userRole === 'b2b_user' || userRole === 'b2b_member' || userRole === 'admin')) {
        urlTypeMatchesRole = true;
      } else if (urlType === 'B2E' && (userRole === 'b2e_user' || userRole === 'b2e_member' || userRole === 'admin')) {
        urlTypeMatchesRole = true;
      } else if (urlType === 'B2C' && (userRole === 'b2c_user' || userRole === 'admin')) {
        urlTypeMatchesRole = true;
      }
      
      // If URL type matches user role, skip product category check (user chose correct type)
      if (!urlTypeMatchesRole && !directProductPurchase) {
        // Check if user can purchase this product based on their role
        // Support both single value and array for targetAudience
        let productTargetAudiences = product.targetAudience || product.category;
        if (!Array.isArray(productTargetAudiences)) {
          productTargetAudiences = productTargetAudiences ? [productTargetAudiences] : [];
        }
        
        // Convert to standard format: 'private-users' -> 'B2C', 'businesses' -> 'B2B', 'schools' -> 'B2E'
        const normalizedAudiences = productTargetAudiences.map(aud => {
          if (aud === 'private-users') return 'B2C';
          if (aud === 'businesses') return 'B2B';
          if (aud === 'schools') return 'B2E';
          return aud;
        });
        
        if (userRole === 'b2c_user') {
          // B2C users can only purchase B2C products
          if (!normalizedAudiences.includes('B2C')) {
            return res.status(403).json({ 
              error: 'You are a B2C user. You can only purchase B2C products.' 
            });
          }
        } else if (userRole === 'b2b_user' || userRole === 'b2b_member') {
          // B2B users can purchase B2B and B2E products (both are organizational)
          if (!normalizedAudiences.includes('B2B') && !normalizedAudiences.includes('B2E')) {
            return res.status(403).json({ 
              error: 'You are a B2B user. You can only purchase B2B or B2E products.' 
            });
          }
        } else if (userRole === 'b2e_user' || userRole === 'b2e_member') {
          // B2E users can purchase B2B and B2E products (both are organizational)
          if (!normalizedAudiences.includes('B2B') && !normalizedAudiences.includes('B2E')) {
            return res.status(403).json({ 
              error: 'You are a B2E user. You can only purchase B2B or B2E products.' 
            });
          }
        }
      }
      
      // For direct product purchases, allow if URL type matches or if product targetAudience matches user role
      if (directProductPurchase && !urlTypeMatchesRole) {
        let productTargetAudiences = product.targetAudience || product.category;
        if (!Array.isArray(productTargetAudiences)) {
          productTargetAudiences = productTargetAudiences ? [productTargetAudiences] : [];
        }
        
        const normalizedAudiences = productTargetAudiences.map(aud => {
          if (aud === 'private-users') return 'B2C';
          if (aud === 'businesses') return 'B2B';
          if (aud === 'schools') return 'B2E';
          return aud;
        });
        
        // Allow direct purchases if:
        // 1. URL type is B2E and product is B2E or B2B (organizational)
        // 2. URL type is B2B and product is B2B or B2E (organizational)
        // 3. URL type is B2C and product is B2C
        const isAllowed = 
          (urlType === 'B2E' && (normalizedAudiences.includes('B2E') || normalizedAudiences.includes('B2B'))) ||
          (urlType === 'B2B' && (normalizedAudiences.includes('B2B') || normalizedAudiences.includes('B2E'))) ||
          (urlType === 'B2C' && normalizedAudiences.includes('B2C'));
        
        if (!isAllowed) {
          return res.status(403).json({ 
            error: `You cannot purchase this product. Please select a product that matches your account type (${urlType}).` 
          });
        }
      }
    }

    let package = null;
    let customPackage = null;
    let pricing = null;
    let packageName = '';
    let packageDescription = '';
    let billingType = 'one_time';
    let currency = 'USD';
    let seatLimit = 5;
    let isShopPagePurchase = false; // Flag to identify shop page purchases
    let requestedPackageType = 'physical'; // Package type for shop page purchases

    // Handle custom package purchase
    if (customPackageId) {
      const CustomPackage = require('../models/CustomPackage');
      customPackage = await CustomPackage.findById(customPackageId)
        .populate('basePackageId')
        .populate('organizationId')
        .populate('schoolId');
      
      if (!customPackage) {
        return res.status(404).json({ error: 'Custom package not found' });
      }

      // Allow purchase even if status is 'pending' - admin created it, so it's ready for purchase
      // Only check if it's already purchased
      const existingTransaction = await Transaction.findOne({
        $or: [
          { organizationId: customPackage.organizationId, customPackageId: customPackage._id, status: 'paid' },
          { schoolId: customPackage.schoolId, customPackageId: customPackage._id, status: 'paid' }
        ]
      });

      if (existingTransaction) {
        return res.status(400).json({ error: 'This custom package has already been purchased' });
      }

      console.log('✅ Custom package purchase check passed:', {
        customPackageId: customPackage._id,
        customPackageName: customPackage.name,
        customPackageStatus: customPackage.status,
        organizationId: customPackage.organizationId,
        schoolId: customPackage.schoolId,
        userId: req.userId
      });

      // No permission check needed - if custom package is created for an organization/school,
      // any admin of that organization/school can purchase it
      // The custom package is already linked to the organization/school, so it's safe to allow purchase

      pricing = customPackage.contractPricing;
      packageName = customPackage.name || customPackage.basePackageId?.name || 'Custom Package';
      packageDescription = customPackage.description || customPackage.basePackageId?.description || '';
      billingType = pricing.billingType || 'one_time';
      currency = pricing.currency || 'USD';
      seatLimit = customPackage.seatLimit || 5;
    } else if (directProductPurchase && productId) {
      // Handle direct product purchase (for shop page products)
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      // Check if this is a shop page purchase
      isShopPagePurchase = req.body.shopPagePurchase === true;
      requestedPackageType = req.body.packageType || 'physical';
      const requestedMaxSeats = req.body.maxSeats !== undefined ? parseInt(req.body.maxSeats) : null;
      
      // Determine price: For shop page physical product (Tactical Card Game Kit), use $49
      let productPrice = product.price || 0;
      if (isShopPagePurchase && requestedPackageType === 'physical') {
        // Override price to $49 for shop page physical product
        productPrice = 49;
      }
      
      // Use product price (or overridden price for shop page physical)
      pricing = {
        amount: productPrice,
        currency: 'USD', // Always USD for direct product purchases
        billingType: 'one_time'
      };
      packageName = product.title || product.name || 'Product';
      // Stripe requires non-empty description, so use product description or default text
      packageDescription = product.description || product.title || product.name || 'Product purchase';
      // Remove HTML tags if present
      if (packageDescription) {
        packageDescription = packageDescription.replace(/<[^>]*>/g, '').trim();
      }
      if (!packageDescription) {
        packageDescription = 'Product purchase';
      }
      billingType = 'one_time';
      currency = 'USD';
      
      // Set seat limit based on package type
      // If packageType is provided (from Products page or shop page), use it
      if (requestedPackageType) {
        if (requestedPackageType === 'physical') {
          seatLimit = requestedMaxSeats !== null ? requestedMaxSeats : 0;
        } else if (requestedPackageType === 'digital' || requestedPackageType === 'digital_physical') {
          seatLimit = requestedMaxSeats !== null ? requestedMaxSeats : 1;
        } else {
          seatLimit = 1; // Default 1 seat
        }
      } else if (isShopPagePurchase && requestedMaxSeats !== null) {
        seatLimit = requestedMaxSeats;
      } else if (isShopPagePurchase && requestedPackageType === 'physical') {
        seatLimit = 0; // Physical products have 0 seats
      } else if (isShopPagePurchase && (requestedPackageType === 'digital' || requestedPackageType === 'digital_physical')) {
        seatLimit = 1; // Digital and bundle products have 1 seat
      } else {
        seatLimit = 1; // Default 1 seat for direct purchases
      }
    } else {
      // Handle regular package purchase
      package = await Package.findById(packageId);
      if (!package) {
        return res.status(404).json({ error: 'Package not found' });
      }

      if (package.status !== 'active' || package.visibility !== 'public') {
        return res.status(400).json({ error: 'Package is not available for purchase' });
      }

      // Check if user already has this package
      const existingMembership = user.memberships.find(
        (m) => m.packageId.toString() === package._id.toString() && m.status === 'active'
      );

      if (existingMembership) {
        return res.status(400).json({ error: 'You already have an active membership for this package' });
      }

      // Check if there's already a successful transaction for this user and package
      const existingTransaction = await Transaction.findOne({
        userId: req.userId,
        packageId: package._id,
        status: 'paid',
      });

      if (existingTransaction) {
        return res.status(400).json({ error: 'You have already purchased this package' });
      }

      pricing = package.pricing;
      packageName = package.name;
      packageDescription = package.description || '';
      billingType = pricing.billingType || 'one_time';
      currency = pricing.currency || 'USD';
      // For B2C packages, default maxSeats to 1
      if (package.targetAudiences && package.targetAudiences.includes('B2C')) {
        seatLimit = package.maxSeats || 1;
      } else {
        seatLimit = package.maxSeats || 5;
      }
    }

    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables.' });
    }

    // Generate unique code for this payment (will be used when transaction is created in webhook)
    // For physical products (shop page or products page), don't generate unique code (no digital access)
    // For digital/digital_physical products (shop page, products page, or regular packages), generate unique code (digital play needed)
    let uniqueCode = null;
    
    // Check if this is a direct product purchase (shop page or products page)
    const isDirectProductPurchase = directProductPurchase === true;
    // Get packageType from request body (for products page purchases), from shopPagePurchase logic, or from package
    let packageTypeFromRequest = req.body.packageType || requestedPackageType || null;
    
    // For custom package purchases, set packageType to 'custom'
    if (customPackage) {
      packageTypeFromRequest = 'custom';
      console.log('📦 Custom package purchase - packageType set to custom:', {
        customPackageId: customPackage._id,
        customPackageName: customPackage.name,
        basePackageType: customPackage.basePackageId?.packageType || customPackage.basePackageId?.type,
        finalPackageType: packageTypeFromRequest
      });
    }
    // For regular package purchases, get packageType from package model (package is already loaded above)
    else if (!isDirectProductPurchase && package) {
      packageTypeFromRequest = package.packageType || package.type || package.category;
      console.log('📦 Package purchase - packageType determined:', {
        packageId: package._id,
        packageName: package.name,
        packageTypeFromPackage: package.packageType,
        packageTypeFromType: package.type,
        packageTypeFromCategory: package.category,
        finalPackageType: packageTypeFromRequest
      });
    }
    
    // Generate unique code for digital/digital_physical packages/products
    // For custom packages, generate unique code for all types except physical
    // Skip only for physical products
    if (customPackage) {
      // For custom packages, generate unique code for all types except physical
      if (packageTypeFromRequest !== 'physical') {
        uniqueCode = generateUniqueCode();
        let codeExists = await Transaction.findOne({ uniqueCode });
        while (codeExists) {
          uniqueCode = generateUniqueCode();
          codeExists = await Transaction.findOne({ uniqueCode });
        }
        console.log('✅ Generated unique code for custom package checkout session:', {
          customPackageId: customPackage._id,
          customPackageName: customPackage.name,
          packageTypeFromRequest,
          uniqueCode
        });
      } else {
        console.log('⚠️ Skipping unique code generation for physical custom package:', {
          customPackageId: customPackage._id,
          customPackageName: customPackage.name,
          packageTypeFromRequest
        });
      }
    } else if (packageTypeFromRequest && (packageTypeFromRequest === 'digital' || packageTypeFromRequest === 'digital_physical')) {
      uniqueCode = generateUniqueCode();
      let codeExists = await Transaction.findOne({ uniqueCode });
      while (codeExists) {
        uniqueCode = generateUniqueCode();
        codeExists = await Transaction.findOne({ uniqueCode });
      }
      console.log('✅ Generated unique code for checkout session:', {
        isDirectProductPurchase,
        packageTypeFromRequest,
        uniqueCode,
        packageId: package?._id,
        packageName: package?.name
      });
    } else {
      console.log('⚠️ Skipping unique code generation:', {
        isDirectProductPurchase,
        packageTypeFromRequest,
        packageId: package?._id,
        packageName: package?.name,
        reason: packageTypeFromRequest === 'physical' ? 'physical product/package' : 'packageType is not digital/digital_physical or is null/undefined'
      });
    }

    // Get frontend URL from environment or use default
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Prepare line items based on billing type (handle both regular packages and custom packages)
    const isSubscription = billingType === 'subscription';
    const lineItems = [
      {
        price_data: {
          currency: currency?.toLowerCase() || 'usd',
          product_data: {
            name: packageName || 'Product',
            // Only include description if it's not empty (Stripe doesn't accept empty strings)
            ...(packageDescription && packageDescription.trim() ? { description: packageDescription.trim() } : {}),
          },
          unit_amount: Math.round(pricing.amount * 100), // Convert to cents
          // Add recurring for subscription mode
          ...(isSubscription && {
            recurring: {
              interval: 'month', // Default to monthly, can be made configurable
            },
          }),
        },
        quantity: 1,
      },
    ];

    // Prepare metadata (different for custom packages vs regular packages vs direct product purchase)
    const metadata = {
      userId: req.userId.toString(),
      productId: productId ? productId.toString() : '',
      packageName: packageName,
      uniqueCode: uniqueCode || '',
      billingType: billingType || 'one_time',
      directProductPurchase: directProductPurchase ? 'true' : 'false',
      seatLimit: seatLimit.toString(),
      urlType: urlType || '', // Store urlType for transaction type determination
    };
    
    // Add shop page purchase flag and package type to metadata if provided
    if (isShopPagePurchase) {
      metadata.shopPagePurchase = 'true';
      metadata.packageType = requestedPackageType;
      metadata.maxSeats = seatLimit.toString();
    }
    
    // Add package type and max seats for Products page purchases (not shop page)
    // This ensures unique code generation and transaction creation work correctly for Products page
    if (directProductPurchase && !isShopPagePurchase && requestedPackageType) {
      metadata.packageType = requestedPackageType;
      metadata.maxSeats = seatLimit.toString();
    }
    
    // Also store referrer URL if available from request headers (for shop page detection)
    const referrerUrl = req.headers.referer || req.headers.referrer || null;
    if (referrerUrl) {
      metadata.referrerUrl = referrerUrl;
    }
    
    // Only add packageId to metadata if it exists AND it's not a direct product purchase
    // For direct product purchases, packageId should NOT be sent
    if (packageId && !directProductPurchase) {
      metadata.packageId = packageId.toString();
    }
    
    // Only add customPackageId to metadata if it exists
    if (customPackageId) {
      metadata.customPackageId = customPackageId.toString();
    }


    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: isSubscription ? 'subscription' : 'payment',
      success_url: `${frontendUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}&uniqueCode=${uniqueCode}`,
      cancel_url: `${frontendUrl}/packages?canceled=true`,
      metadata: metadata,
      customer_email: user.email,
    });

    res.json({
      sessionId: session.id,
      url: session.url,
      uniqueCode: uniqueCode,
    });
  } catch (error) {
    // Safely get values from req.body in case variables are not in scope
    const errorPackageId = req.body?.packageId || null;
    const errorProductId = req.body?.productId || null;
    const errorDirectProductPurchase = req.body?.directProductPurchase || false;
    
    // Safely get package info if it was loaded
    let errorPackageName = null;
    let errorBillingType = null;
    try {
      if (typeof package !== 'undefined' && package) {
        errorPackageName = package.name || null;
        errorBillingType = package.pricing?.billingType || null;
      } else if (typeof packageName !== 'undefined') {
        errorPackageName = packageName;
      }
      if (!errorBillingType && typeof billingType !== 'undefined') {
        errorBillingType = billingType;
      }
    } catch (e) {
      // Variables not in scope, ignore
    }
    
    console.error('Error creating checkout session:', {
      error: error.message,
      stack: error.stack,
      packageId: errorPackageId,
      productId: errorProductId,
      directProductPurchase: errorDirectProductPurchase,
      packageName: errorPackageName,
      billingType: errorBillingType,
      stripeError: error.type || error.code,
    });
    
    // Provide more specific error messages
    let errorMessage = 'Failed to create checkout session';
    if (error.type === 'StripeInvalidRequestError') {
      errorMessage = error.message || 'Invalid payment configuration. Please contact support.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// Stripe webhook handler (raw body is handled in server.js before json parser)
router.post('/webhook', async (req, res) => {
  console.log('🔔 WEBHOOK ENDPOINT CALLED:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    hasBody: !!req.body,
    bodyType: typeof req.body,
    bodyLength: req.body ? (typeof req.body === 'string' ? req.body.length : JSON.stringify(req.body).length) : 0,
    headers: {
      'stripe-signature': req.headers['stripe-signature'] ? 'present' : 'missing',
      'content-type': req.headers['content-type']
    }
  });

  if (!isStripeConfigured()) {
    console.warn('⚠️ Stripe is not configured. Webhook ignored.');
    return res.status(200).json({ received: true, message: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  console.log('🔍 Webhook Configuration Check:', {
    hasStripe: !!stripe,
    hasWebhookSecret: !!webhookSecret,
    hasSignature: !!sig,
    webhookSecretLength: webhookSecret ? webhookSecret.length : 0
  });

  if (!webhookSecret) {
    console.warn('⚠️ STRIPE_WEBHOOK_SECRET not configured. Webhook verification skipped.');
    // In development, you might want to allow this
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).send('Webhook secret not configured');
    }
  }

  let event;

  try {
    if (webhookSecret && stripe) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // In development, parse event without verification
      event = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body.toString ? JSON.parse(req.body.toString()) : req.body);
    }
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', {
      error: err.message,
      stack: err.stack,
      hasWebhookSecret: !!webhookSecret,
      hasSignature: !!sig,
      bodyPreview: typeof req.body === 'string' ? req.body.substring(0, 200) : JSON.stringify(req.body).substring(0, 200)
    });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Store complete webhook event data
    const webhookEventData = {
      id: event.id,
      type: event.type,
      created: event.created,
      livemode: event.livemode,
      api_version: event.api_version,
      data: event.data,
      object: event.data?.object || null,
      request: event.request || null,
      pending_webhooks: event.pending_webhooks || null,
      received_at: new Date()
    };

    console.log('📥 Webhook Event Received:', {
      type: event.type,
      id: event.id,
      livemode: event.livemode,
      created: new Date(event.created * 1000)
    });

    // Log webhook data structure for debugging
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      console.log('🔍 Webhook Session Details (Initial):', {
        sessionId: session.id,
        paymentIntentId: session.payment_intent,
        paymentStatus: session.payment_status,
        customerEmail: session.customer_email,
        customer: session.customer,
        hasMetadata: !!session.metadata,
        metadataKeys: session.metadata ? Object.keys(session.metadata) : [],
        metadata: session.metadata,
        directProductPurchase: session.metadata?.directProductPurchase,
        shopPagePurchase: session.metadata?.shopPagePurchase,
        packageType: session.metadata?.packageType,
        productId: session.metadata?.productId,
        packageId: session.metadata?.packageId,
        userId: session.metadata?.userId
      });
    }

    // Handle Stripe Checkout Session completed
    if (event.type === 'checkout.session.completed') {
      let session = event.data.object;
      
      // CRITICAL: If metadata is empty or missing, retrieve full session from Stripe API
      if (!session.metadata || Object.keys(session.metadata).length === 0) {
        console.log('⚠️ Session metadata is empty, retrieving full session from Stripe API...');
        try {
          session = await stripe.checkout.sessions.retrieve(session.id, {
            expand: ['payment_intent', 'customer']
          });
          console.log('✅ Retrieved full session from Stripe API:', {
            sessionId: session.id,
            hasMetadata: !!session.metadata,
            metadataKeys: session.metadata ? Object.keys(session.metadata) : [],
            customerEmail: session.customer_email,
            customer: session.customer
          });
        } catch (err) {
          console.error('❌ Error retrieving session from Stripe API:', err.message);
        }
      }
      
      // Check if transaction already exists for this checkout session (prevent duplicates)
      let transaction = await Transaction.findOne({
        stripePaymentIntentId: session.payment_intent || session.id,
      });

      // If transaction already exists (created via fallback), update it with webhook data
      if (transaction) {
        console.log('📝 Transaction already exists, updating with webhook data:', {
          transactionId: transaction._id,
          stripePaymentIntentId: transaction.stripePaymentIntentId,
          webhookEventType: event.type,
          webhookEventId: event.id
        });

        // Update transaction with webhook data
        transaction.webhookData = webhookEventData;
        transaction.webhookEventType = event.type;
        transaction.webhookReceivedAt = new Date();
        await transaction.save();

        console.log('✅ Transaction updated with webhook data:', {
          transactionId: transaction._id,
          webhookEventType: event.type
        });

        // Return early since transaction already exists
        return res.json({ received: true, processed: true, updated: true });
      }

      // Only create transaction if it doesn't exist (prevent duplicates)
      if (!transaction) {
        // CRITICAL: Use SAME userId resolution logic as fallback flow
        // This ensures webhook behaves identically to transaction-by-session endpoint
        let paymentIntent = null;
        if (session.payment_intent) {
          try {
            paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
          } catch (err) {
            console.warn('⚠️ Could not retrieve payment intent:', err.message);
          }
        }
        
        const { userId, source, user } = await resolveUserIdFromCheckout(session, paymentIntent, stripe);
        
        console.log('🔍 resolveUserIdFromCheckout result (WEBHOOK):', {
          userId,
          source,
          hasUser: !!user,
          sessionId: session.id,
          paymentIntentId: session.payment_intent
        });
        
        if (!userId || !user) {
          console.error('❌ Cannot create transaction: userId missing and user not found by any method');
          console.error('❌ Full session object:', JSON.stringify(session, null, 2));
          // Return 200 to prevent Stripe retries, but log the error
          return res.status(200).json({ 
            received: true, 
            error: 'User not found - userId missing in metadata',
            sessionId: session.id,
            source: source
          });
        }
        
        // Extract metadata (same as fallback flow)
        const packageId = session.metadata?.packageId || null;
        const customPackageId = session.metadata?.customPackageId || null;
        // CRITICAL: productId might be empty string, handle it properly
        let productId = session.metadata?.productId;
        if (productId === '' || productId === 'null' || productId === 'undefined') {
          productId = null;
        }
        let uniqueCode = session.metadata?.uniqueCode || null;
        const billingType = session.metadata?.billingType || 'one_time';
        const directProductPurchase = session.metadata?.directProductPurchase === 'true';
        const seatLimit = directProductPurchase ? 1 : (parseInt(session.metadata?.seatLimit) || 5);
        
        // Log extracted metadata for debugging
        console.log('🔍 Extracted metadata from session (WEBHOOK):', {
          productId,
          productIdType: typeof productId,
          directProductPurchase,
          packageId,
          customPackageId,
          sessionId: session.id
        });
        
        // Purchase date is when the transaction is created (now)
        const purchaseDate = new Date();

        console.log('🔍 User data for transaction (WEBHOOK):', {
          userId: user._id,
          source: source,
          schoolId: user.schoolId,
          organizationId: user.organizationId,
          email: user.email
        });

        let package = null;
        let customPackage = null;
        let transactionType = 'b2c_purchase';
        let packageType = 'standard';
        let maxSeats = seatLimit;
        let contractEndDate = null;

        // Handle custom package purchase
        if (customPackageId) {
          const CustomPackage = require('../models/CustomPackage');
          customPackage = await CustomPackage.findById(customPackageId)
            .populate('basePackageId')
            .populate('organizationId')
            .populate('schoolId')
            .populate('productIds'); // Populate productIds array
          
          if (!customPackage) {
            console.error('Custom package not found for checkout session:', session.id);
            return res.json({ received: true, error: 'Custom package not found' });
          }

          // Extract productId from productIds array (use first productId)
          console.log(`🔍 Custom package productIds:`, customPackage.productIds);
          console.log(`🔍 Custom package productIds type:`, typeof customPackage.productIds);
          console.log(`🔍 Custom package productIds is array:`, Array.isArray(customPackage.productIds));
          console.log(`🔍 Custom package productIds length:`, customPackage.productIds?.length || 0);
          
          if (customPackage.productIds && Array.isArray(customPackage.productIds) && customPackage.productIds.length > 0) {
            const firstProduct = customPackage.productIds[0];
            productId = firstProduct._id || firstProduct.id || firstProduct || null;
            console.log(`✅ Extracted productId from custom package: ${productId}`);
            console.log(`✅ First product details:`, {
              _id: firstProduct._id,
              id: firstProduct.id,
              product: firstProduct
            });
          } else {
            console.warn('⚠️ Custom package has no productIds array or it is empty');
            console.warn('⚠️ Custom package ID:', customPackage._id);
            console.warn('⚠️ Custom package data:', JSON.stringify(customPackage.toObject(), null, 2));
          }

          // Determine transaction type based on organization/school
          if (customPackage.organizationId) {
            const org = await Organization.findById(customPackage.organizationId);
            transactionType = org?.segment === 'B2B' ? 'b2b_contract' : 'b2e_contract';
          } else if (customPackage.schoolId) {
            transactionType = 'b2e_contract';
          }

          packageType = 'custom'; // Set packageType to 'custom' for custom packages
          maxSeats = customPackage.seatLimit || seatLimit;
          
          // Generate unique code for custom packages (except physical)
          // Custom packages always need unique codes for digital access
          const metadataUniqueCode = session.metadata.uniqueCode;
          const hasValidUniqueCode = metadataUniqueCode && metadataUniqueCode !== '' && metadataUniqueCode !== 'null' && metadataUniqueCode !== 'undefined';
          
          // For custom packages, ALWAYS ensure unique code is generated (except physical)
          if (packageType === 'custom' || packageType === 'digital' || packageType === 'digital_physical') {
            if (hasValidUniqueCode) {
              uniqueCode = metadataUniqueCode;
              console.log('✅ Using unique code from metadata for custom package:', {
                customPackageId: customPackage._id,
                customPackageName: customPackage.name,
                packageType: packageType,
                uniqueCode: uniqueCode
              });
            } else {
              // Generate new unique code if not in metadata
              const TransactionModel = require('../models/Transaction');
              let generatedCode = generateUniqueCode();
              let codeExists = await TransactionModel.findOne({ uniqueCode: generatedCode });
              while (codeExists) {
                generatedCode = generateUniqueCode();
                codeExists = await TransactionModel.findOne({ uniqueCode: generatedCode });
              }
              uniqueCode = generatedCode;
              console.log('✅ Generated unique code for custom package purchase (webhook):', {
                customPackageId: customPackage._id,
                customPackageName: customPackage.name,
                packageType: packageType,
                metadataUniqueCode: metadataUniqueCode,
                generatedUniqueCode: uniqueCode
              });
            }
          } else if (packageType === 'physical') {
            uniqueCode = undefined;
            console.log('⚠️ No unique code for physical custom package:', {
              customPackageId: customPackage._id,
              customPackageName: customPackage.name,
              packageType: packageType
            });
          } else {
            // For other package types (standard, renewal), generate unique code
            if (!hasValidUniqueCode) {
              const TransactionModel = require('../models/Transaction');
              let generatedCode = generateUniqueCode();
              let codeExists = await TransactionModel.findOne({ uniqueCode: generatedCode });
              while (codeExists) {
                generatedCode = generateUniqueCode();
                codeExists = await TransactionModel.findOne({ uniqueCode: generatedCode });
              }
              uniqueCode = generatedCode;
              console.log('✅ Generated unique code for standard custom package purchase (webhook):', {
                customPackageId: customPackage._id,
                customPackageName: customPackage.name,
                packageType: packageType,
                generatedUniqueCode: uniqueCode
              });
            } else {
              uniqueCode = metadataUniqueCode;
            }
          }
          
          // FINAL SAFETY CHECK: Ensure unique code is generated for custom packages (except physical)
          if (packageType === 'custom' && (!uniqueCode || uniqueCode === null || uniqueCode === undefined || uniqueCode === '')) {
            console.log('🚨 CRITICAL: Unique code missing for digital custom package, generating now BEFORE transaction creation...', {
              customPackageId: customPackage._id,
              customPackageName: customPackage.name,
              packageType: packageType,
              currentUniqueCode: uniqueCode
            });
            const TransactionModel = require('../models/Transaction');
            let generatedCode = generateUniqueCode();
            let codeExists = await TransactionModel.findOne({ uniqueCode: generatedCode });
            while (codeExists) {
              generatedCode = generateUniqueCode();
              codeExists = await TransactionModel.findOne({ uniqueCode: generatedCode });
            }
            uniqueCode = generatedCode;
            console.log('✅ CRITICAL FIX: Generated unique code for digital custom package BEFORE transaction creation:', {
              customPackageId: customPackage._id,
              customPackageName: customPackage.name,
              packageType: packageType,
              generatedUniqueCode: uniqueCode
            });
          }
          
          // Calculate expiry date from custom package expiryTime and expiryTimeUnit
          // Start date is purchase date, end date is calculated from purchase date + expiry time
          if (customPackage.expiryTime && customPackage.expiryTimeUnit) {
            const calculatedExpiryDate = calculateExpiryDate(customPackage, purchaseDate);
            if (calculatedExpiryDate) {
              contractEndDate = setEndOfDay(calculatedExpiryDate);
              console.log('✅ Calculated expiry date for custom package:', {
                customPackageId: customPackage._id,
                customPackageName: customPackage.name,
                expiryTime: customPackage.expiryTime,
                expiryTimeUnit: customPackage.expiryTimeUnit,
                startDate: purchaseDate,
                endDate: contractEndDate
              });
            } else {
              // Fallback to contract endDate if calculation fails
              contractEndDate = customPackage.contract?.endDate || null;
            }
          } else {
            // Use contract endDate if no expiryTime is set
            contractEndDate = customPackage.contract?.endDate || null;
          }

          // Activate custom package
          customPackage.status = 'active';
          customPackage.contract.status = 'active';
          // Update contract startDate to purchase date and endDate to calculated expiry
          customPackage.contract.startDate = purchaseDate;
          if (contractEndDate) {
            customPackage.contract.endDate = contractEndDate;
          }
          await customPackage.save();

          // Update custom package request status to 'completed' if it exists
          if (customPackage.customPackageRequestId) {
            const CustomPackageRequest = require('../models/CustomPackageRequest');
            const relatedRequest = await CustomPackageRequest.findById(customPackage.customPackageRequestId);
            if (relatedRequest) {
              relatedRequest.status = 'completed';
              await relatedRequest.save();
              console.log(`✅ Custom package request ${relatedRequest._id} marked as completed after purchase`);
            }
          } else {
            // Try to find request by customPackageId
            const CustomPackageRequest = require('../models/CustomPackageRequest');
            const relatedRequest = await CustomPackageRequest.findOne({ customPackageId: customPackage._id });
            if (relatedRequest) {
              relatedRequest.status = 'completed';
              await relatedRequest.save();
              console.log(`✅ Custom package request ${relatedRequest._id} marked as completed after purchase (found by customPackageId)`);
            }
          }
        } else if (directProductPurchase && productId) {
          // Handle direct product purchase (for physical products)
          const Product = require('../models/Product');
          
          // CRITICAL: productId might be string or ObjectId, handle both
          let product = null;
          try {
            // Try to find by ID (handles both string and ObjectId)
            product = await Product.findById(productId);
            if (!product) {
              // If not found, try to find by _id as string
              product = await Product.findOne({ _id: productId });
            }
            if (!product) {
              // Log detailed error for debugging
              console.error('❌ Product not found for direct purchase:', {
                productId,
                productIdType: typeof productId,
                productIdLength: productId?.length,
                sessionId: session.id,
                metadata: session.metadata
              });
              return res.json({ received: true, error: 'Product not found', productId });
            }
            console.log('✅ Product found for direct purchase:', {
              productId: product._id,
              productName: product.title || product.name,
              sessionId: session.id
            });
          } catch (err) {
            console.error('❌ Error finding product:', {
              error: err.message,
              productId,
              productIdType: typeof productId
            });
            return res.json({ received: true, error: 'Error finding product', productId });
          }
          
          // Determine transaction type based on urlType from session metadata
          const urlType = session.metadata.urlType || null;
          if (urlType === 'B2B') {
            transactionType = 'b2b_contract';
          } else if (urlType === 'B2E') {
            transactionType = 'b2e_contract';
          } else if (urlType === 'B2C') {
            transactionType = 'b2c_purchase';
          } else {
            // Fallback: determine from user role if urlType is not available
            if (user.role === 'b2b_user' || user.role === 'b2b_member') {
              transactionType = 'b2b_contract';
            } else if (user.role === 'b2e_user' || user.role === 'b2e_member') {
              transactionType = 'b2e_contract';
            } else {
              transactionType = 'b2c_purchase';
            }
          }
          
          // Check if this is a shop page purchase or Products page purchase
          const isShopPagePurchase = session.metadata.shopPagePurchase === 'true';
          const directProductPurchase = session.metadata.directProductPurchase === 'true';
          const metadataPackageType = session.metadata.packageType || null;
          
          // Handle both shop page and Products page direct product purchases
          if ((isShopPagePurchase || (directProductPurchase && metadataPackageType))) {
            // Shop page or Products page purchase - use packageType and maxSeats from metadata
            packageType = metadataPackageType || 'physical';
            const metadataMaxSeats = session.metadata.maxSeats;
            if (metadataMaxSeats !== undefined && metadataMaxSeats !== null && metadataMaxSeats !== '') {
              maxSeats = parseInt(metadataMaxSeats);
            } else {
              // Default based on packageType
              if (packageType === 'physical') {
                maxSeats = 0;
              } else {
                maxSeats = 1;
              }
            }
            
            // Generate unique code for digital and bundle products (not for physical)
            if (packageType === 'digital' || packageType === 'digital_physical') {
              if (!uniqueCode || uniqueCode === '') {
                uniqueCode = generateUniqueCode();
                let codeExists = await Transaction.findOne({ uniqueCode });
                while (codeExists) {
                  uniqueCode = generateUniqueCode();
                  codeExists = await Transaction.findOne({ uniqueCode });
                }
              }
            } else {
              uniqueCode = undefined; // No unique code for physical products
            }
            
            console.log(`✅ ${isShopPagePurchase ? 'Shop page' : 'Products page'} purchase:`, {
              productId: product._id,
              productName: product.title || product.name,
              price: product.price,
              packageType: packageType,
              maxSeats: maxSeats,
              hasUniqueCode: !!uniqueCode
            });
          } else {
            // Regular direct product purchase (not from shop page)
            packageType = 'physical'; // Set to 'physical' for tactical card purchases
            maxSeats = 0; // Physical products have 0 seats (no digital access)
            uniqueCode = undefined; // No unique code for physical products
          }
          
          // For all direct product purchases, typically 1 year expiry
          const expiryDate = new Date(purchaseDate);
          expiryDate.setFullYear(expiryDate.getFullYear() + 1); // 1 year from purchase
          contractEndDate = setEndOfDay(expiryDate);
          
          console.log('✅ Direct product purchase:', {
            productId: product._id,
            productName: product.title || product.name,
            price: product.price,
            urlType: urlType,
            userRole: user.role,
            transactionType: transactionType,
            packageType: packageType,
            maxSeats: maxSeats,
            isShopPagePurchase: isShopPagePurchase
          });
        } else if (packageId) {
          // Handle regular package purchase
          package = await Package.findById(packageId);
          
          if (!package) {
            console.error('Package not found for checkout session:', session.id);
            return res.json({ received: true, error: 'Package not found' });
          }

          // Fetch product if productId is provided
          let product = null;
          if (productId) {
            const Product = require('../models/Product');
            product = await Product.findById(productId);
          }

          // Determine transaction type based on USER ROLE (not product/package targetAudience)
          // This ensures transaction type matches the user who is purchasing
          if (user.role === 'b2c_user') {
            transactionType = 'b2c_purchase';
          } else if (user.role === 'b2b_user' || user.role === 'b2b_member') {
            transactionType = 'b2b_contract';
          } else if (user.role === 'b2e_user' || user.role === 'b2e_member') {
            transactionType = 'b2e_contract';
          } else {
            // Fallback to product/package targetAudience if role doesn't match
            transactionType = getTransactionType(package, product);
          }
          packageType = package.packageType || package.type || package.category || 'standard';
          
          // CRITICAL FIX: If productId is present, check product to determine packageType for digital/digital_physical
          // This handles Products page purchases where package might have 'standard' type but product is digital
          if (productId && product) {
            const productTitle = (product.title || product.name || '').toLowerCase();
            const isDigitalProduct = productTitle.includes('digital') || productTitle.includes('extension');
            const isBundleProduct = productTitle.includes('bundle') || productTitle.includes('full') || productTitle.includes('best value');
            const isPhysicalProduct = productTitle.includes('physical') || productTitle.includes('tactical');
            
            // Override packageType based on product if package type is 'standard' or doesn't indicate digital
            if (packageType === 'standard' || (!packageType || packageType === null)) {
              if (isDigitalProduct) {
                packageType = 'digital';
                console.log('🔧 Override packageType to "digital" based on product:', {
                  productId: product._id,
                  productTitle: product.title || product.name,
                  originalPackageType: package.packageType || package.type,
                  newPackageType: packageType
                });
              } else if (isBundleProduct) {
                packageType = 'digital_physical';
                console.log('🔧 Override packageType to "digital_physical" based on product:', {
                  productId: product._id,
                  productTitle: product.title || product.name,
                  originalPackageType: package.packageType || package.type,
                  newPackageType: packageType
                });
              } else if (isPhysicalProduct) {
                packageType = 'physical';
              }
            }
          }
          
          console.log('📦 Final packageType determined for webhook:', {
            packageId: package._id,
            packageName: package.name,
            packageTypeFromPackage: package.packageType,
            packageTypeFromType: package.type,
            packageTypeFromCategory: package.category,
            productId: productId,
            productName: product?.title || product?.name,
            finalPackageType: packageType
          });
          
          // For B2C packages, default maxSeats to 1
          if (package.targetAudiences && package.targetAudiences.includes('B2C')) {
            maxSeats = package.maxSeats || 1;
          } else {
            maxSeats = package.maxSeats || seatLimit;
          }
          
          // Generate unique code for digital/digital_physical packages if not already in metadata
          // This handles Products page purchases that go through packages page and regular package purchases
          const metadataUniqueCode = session.metadata.uniqueCode;
          const hasValidUniqueCode = metadataUniqueCode && metadataUniqueCode !== '' && metadataUniqueCode !== 'null' && metadataUniqueCode !== 'undefined';
          
          // For digital/digital_physical packages, ALWAYS ensure unique code is generated
          if (packageType === 'digital' || packageType === 'digital_physical') {
            if (hasValidUniqueCode) {
              uniqueCode = metadataUniqueCode;
              console.log('✅ Using unique code from metadata:', {
                packageId: package._id,
                packageName: package.name,
                packageType: packageType,
                uniqueCode: uniqueCode
              });
            } else {
              // Generate new unique code if not in metadata
              const TransactionModel = require('../models/Transaction');
              let generatedCode = generateUniqueCode();
              let codeExists = await TransactionModel.findOne({ uniqueCode: generatedCode });
              while (codeExists) {
                generatedCode = generateUniqueCode();
                codeExists = await TransactionModel.findOne({ uniqueCode: generatedCode });
              }
              uniqueCode = generatedCode;
              console.log('✅ Generated unique code for digital package purchase (webhook):', {
                packageId: package._id,
                packageName: package.name,
                packageType: packageType,
                metadataUniqueCode: metadataUniqueCode,
                generatedUniqueCode: uniqueCode
              });
            }
          } else if (packageType === 'physical') {
            uniqueCode = undefined;
            console.log('⚠️ No unique code for physical package:', {
              packageId: package._id,
              packageName: package.name,
              packageType: packageType
            });
          } else {
            // For other package types (standard, renewal), generate unique code
            if (!hasValidUniqueCode) {
              const TransactionModel = require('../models/Transaction');
              let generatedCode = generateUniqueCode();
              let codeExists = await TransactionModel.findOne({ uniqueCode: generatedCode });
              while (codeExists) {
                generatedCode = generateUniqueCode();
                codeExists = await TransactionModel.findOne({ uniqueCode: generatedCode });
              }
              uniqueCode = generatedCode;
              console.log('✅ Generated unique code for standard package purchase (webhook):', {
                packageId: package._id,
                packageName: package.name,
                packageType: packageType,
                generatedUniqueCode: uniqueCode
              });
            } else {
              uniqueCode = metadataUniqueCode;
            }
          }
          
          // FINAL SAFETY CHECK: Ensure unique code is generated for digital/digital_physical packages
          // This MUST happen before Transaction.create() - cannot use await in object property
          if ((packageType === 'digital' || packageType === 'digital_physical') && (!uniqueCode || uniqueCode === null || uniqueCode === undefined || uniqueCode === '')) {
            console.log('🚨 CRITICAL: Unique code missing for digital package, generating now BEFORE transaction creation...', {
              packageId: package._id,
              packageName: package.name,
              packageType: packageType,
              currentUniqueCode: uniqueCode
            });
            const TransactionModel = require('../models/Transaction');
            let generatedCode = generateUniqueCode();
            let codeExists = await TransactionModel.findOne({ uniqueCode: generatedCode });
            while (codeExists) {
              generatedCode = generateUniqueCode();
              codeExists = await TransactionModel.findOne({ uniqueCode: generatedCode });
            }
            uniqueCode = generatedCode;
            console.log('✅ CRITICAL FIX: Generated unique code for digital package BEFORE transaction creation:', {
              packageId: package._id,
              packageName: package.name,
              packageType: packageType,
              generatedUniqueCode: uniqueCode
            });
          }
          
          // Calculate expiry date from package expiryTime and expiryTimeUnit
          // Start date is purchase date, end date is calculated from purchase date + expiry time
          const calculatedExpiryDate = calculateExpiryDate(package, purchaseDate);
          if (calculatedExpiryDate) {
            contractEndDate = setEndOfDay(calculatedExpiryDate);
            console.log('✅ Calculated expiry date for package:', {
              packageId: package._id,
              packageName: package.name,
              expiryTime: package.expiryTime,
              expiryTimeUnit: package.expiryTimeUnit,
              startDate: purchaseDate,
              endDate: contractEndDate
            });
          } else {
            console.log('⚠️ No expiry time set for package, using default or subscription end date');
          }
        } else {
          console.error('Neither packageId, customPackageId, nor directProductPurchase found in session metadata:', session.id);
          return res.json({ received: true, error: 'Package ID, Custom Package ID, or direct product purchase required' });
        }

        // Check if user already has this package (prevent duplicate memberships) - only for regular packages
        if (packageId && !customPackageId) {
          const existingMembership = user.memberships.find(
            (m) => m.packageId.toString() === packageId && m.status === 'active'
          );

          if (existingMembership) {
            console.warn('User already has active membership for this package:', packageId);
            return res.json({ received: true, warning: 'User already has membership' });
          }
        }

        // Get payment amount from session
        const amount = session.amount_total ? session.amount_total / 100 : session.amount_subtotal / 100;
        // CRITICAL: Always use USD for transactions, not PKR or other currencies
        const currency = 'USD';

        // Get organizationId or schoolId from custom package or user
        let organizationId = null;
        let schoolId = null;
        
        if (customPackage) {
          organizationId = customPackage.organizationId?._id || customPackage.organizationId || null;
          schoolId = customPackage.schoolId?._id || customPackage.schoolId || null;
        } else {
          organizationId = user.organizationId || null;
          schoolId = user.schoolId || null;
        }
        
        // Also check if user is owner of school/organization
        const Organization = require('../models/Organization');
        const School = require('../models/School');
        let ownerOrgId = null;
        let ownerSchoolId = null;
        
        try {
          const orgAsOwner = await Organization.findOne({ ownerId: user._id });
          if (orgAsOwner) ownerOrgId = orgAsOwner._id;
        } catch (e) {}
        
        try {
          const schoolAsOwner = await School.findOne({ ownerId: user._id });
          if (schoolAsOwner) ownerSchoolId = schoolAsOwner._id;
        } catch (e) {}

        // Create transaction ONLY when payment succeeds
        // For direct product purchases, don't save any package-related fields
        transaction = await Transaction.create({
          type: transactionType,
          userId: userId,
          organizationId: organizationId || ownerOrgId, // Set organizationId from custom package, user, or owner
          schoolId: schoolId || ownerSchoolId, // Set schoolId from custom package, user, or owner
          // For direct product purchases, packageId is undefined but packageType is 'physical' and no uniqueCode
          packageId: directProductPurchase ? undefined : (packageId || null), // Regular package ID (undefined for direct product purchase)
          customPackageId: directProductPurchase ? undefined : (customPackageId || null), // Custom package ID (undefined for direct product purchase)
          packageType: packageType || null, // Package type ('physical' for direct product purchases)
          productId: productId || null,
          amount: amount,
          currency: currency,
          status: 'paid',
          paymentProvider: 'stripe',
          stripePaymentIntentId: session.payment_intent || session.id,
          // For physical products, don't save uniqueCode (no digital access code needed)
          // For digital/digital_physical products (shop page, Products page, or regular packages), save uniqueCode
          uniqueCode: (packageType === 'physical') ? undefined : (uniqueCode || undefined),
          maxSeats: (directProductPurchase && packageType) ? maxSeats : (directProductPurchase && packageType === 'physical' ? 0 : maxSeats), // Use maxSeats from metadata for Products page purchases
          usedSeats: 0,
          codeApplications: 0,
          gamePlays: [],
          referrals: [],
          contractPeriod: {
            startDate: purchaseDate, // Start date is purchase date
            endDate: contractEndDate || (billingType === 'subscription'
              ? new Date(purchaseDate.getTime() + 365 * 24 * 60 * 60 * 1000)
              : null),
          },
          // Store complete webhook event data
          webhookData: webhookEventData,
          webhookEventType: event.type,
          webhookReceivedAt: new Date(),
        });

        // Verify webhook data was saved
        const savedTransaction = await Transaction.findById(transaction._id);
        console.log('🔍 Webhook Data Verification:', {
          transactionId: savedTransaction._id,
          hasWebhookData: !!savedTransaction.webhookData,
          webhookDataType: typeof savedTransaction.webhookData,
          webhookEventType: savedTransaction.webhookEventType,
          webhookReceivedAt: savedTransaction.webhookReceivedAt,
          webhookDataKeys: savedTransaction.webhookData ? Object.keys(savedTransaction.webhookData) : 'null'
        });

        console.log('✅ Transaction created via WEBHOOK (PRIMARY METHOD) with webhook data:', {
          transactionId: transaction._id,
          webhookEventType: event.type,
          webhookEventId: event.id,
          stripePaymentIntentId: transaction.stripePaymentIntentId,
          directProductPurchase: directProductPurchase,
          shopPagePurchase: session.metadata?.shopPagePurchase === 'true',
          productsPagePurchase: directProductPurchase && session.metadata?.packageType && session.metadata?.shopPagePurchase !== 'true',
          packageType: packageType,
          productId: productId,
          packageId: packageId,
          hasWebhookData: !!transaction.webhookData,
          webhookDataKeys: transaction.webhookData ? Object.keys(transaction.webhookData) : []
        });

        // Update GameProgress isDemo to false when user makes a purchase
        // This allows demo users who purchase to see their game progress
        try {
          const GameProgress = require('../models/GameProgress');
          const updateResult = await GameProgress.updateMany(
            { userId: userId, isDemo: true },
            { $set: { isDemo: false } }
          );
          console.log(`✅ Updated GameProgress isDemo to false for user ${userId} after purchase`);
          console.log(`📊 Updated ${updateResult.modifiedCount} GameProgress document(s) from isDemo: true to isDemo: false`);
        } catch (gameProgressError) {
          console.error('Error updating GameProgress isDemo:', gameProgressError);
          // Don't fail the transaction if this update fails
        }

        // Add membership to user (only for regular packages, not custom packages)
        if (packageId && !customPackageId) {
          // Fetch product if productId is provided
          let product = null;
          if (productId) {
            const Product = require('../models/Product');
            product = await Product.findById(productId);
          }

          // Determine membership type based on package targetAudiences or product targetAudience
          const membershipType = getMembershipType(package, product);
          console.log('🔍 Membership Type Determination:', {
            productId: productId,
            productTargetAudience: product?.targetAudience,
            packageTargetAudiences: package?.targetAudiences,
            determinedMembershipType: membershipType
          });

          // Determine membership end date - use calculated expiry date from expiryTime or expiryDate
          let membershipEndDate = transaction.contractPeriod.endDate;
          const calculatedExpiryDate = calculateExpiryDate(package, transaction.contractPeriod.startDate);
          if (calculatedExpiryDate) {
            membershipEndDate = calculatedExpiryDate;
          }

          // Add membership to user
          user.memberships.push({
            packageId: packageId,
            membershipType: membershipType,
            status: 'active',
            startDate: transaction.contractPeriod.startDate,
            endDate: membershipEndDate,
          });
          await user.save();
        }

        // Add transaction to organization/school's transactionIds array
        // Check if user is owner or member of school/organization
        // Organization and School are already declared above
        
        const transactionIdStr = transaction._id.toString();
        
        // Store owner org/school IDs for later use
        let orgAsOwner = null;
        let schoolAsOwner = null;
        
        // First, check if user is owner of any organization
        try {
          orgAsOwner = await Organization.findOne({ ownerId: user._id });
          if (orgAsOwner) {
            if (!orgAsOwner.transactionIds) {
              orgAsOwner.transactionIds = [];
            }
            const existingIds = orgAsOwner.transactionIds.map(id => id.toString());
            if (!existingIds.includes(transactionIdStr)) {
              orgAsOwner.transactionIds.push(transaction._id);
              await orgAsOwner.save();
              console.log(`✅ Transaction ${transactionIdStr} added to organization (owner) ${orgAsOwner._id} (${orgAsOwner.name})`);
            }
          }
        } catch (orgOwnerErr) {
          console.error('Error adding transaction to organization (owner):', orgOwnerErr);
        }
        
        // Check if user is owner of any school
        try {
          schoolAsOwner = await SchoolModel3.findOne({ ownerId: user._id });
          if (schoolAsOwner) {
            if (!schoolAsOwner.transactionIds) {
              schoolAsOwner.transactionIds = [];
            }
            const existingIds = schoolAsOwner.transactionIds.map(id => id.toString());
            if (!existingIds.includes(transactionIdStr)) {
              schoolAsOwner.transactionIds.push(transaction._id);
              await schoolAsOwner.save();
              console.log(`✅ Transaction ${transactionIdStr} added to school (owner) ${schoolAsOwner._id} (${schoolAsOwner.name})`);
            }
          }
        } catch (schoolOwnerErr) {
          console.error('Error adding transaction to school (owner):', schoolOwnerErr);
        }
        
        // If user has organizationId, add to organization (as member)
        if (user.organizationId) {
          try {
            const organization = await OrganizationModel4.findById(user.organizationId);
            if (organization) {
              // Initialize transactionIds if it doesn't exist
              if (!organization.transactionIds) {
                organization.transactionIds = [];
              }
              // Convert both to string for comparison
              const existingIds = organization.transactionIds.map(id => id.toString());
              if (!existingIds.includes(transactionIdStr)) {
                organization.transactionIds.push(transaction._id);
                await organization.save();
                console.log(`✅ Transaction ${transactionIdStr} added to organization (member) ${organization._id} (${organization.name})`);
              } else {
                console.log(`⚠️ Transaction ${transactionIdStr} already exists in organization ${organization._id}`);
              }
            } else {
              console.log(`❌ Organization not found with ID: ${user.organizationId}`);
            }
          } catch (orgErr) {
            console.error('Error adding transaction to organization:', orgErr);
          }
        }
        
        // If user has schoolId, add to school (as member)
        if (user.schoolId) {
          try {
            const school = await SchoolModel4.findById(user.schoolId);
            if (school) {
              // Initialize transactionIds if it doesn't exist
              if (!school.transactionIds) {
                school.transactionIds = [];
              }
              // Convert both to string for comparison
              const existingIds = school.transactionIds.map(id => id.toString());
              if (!existingIds.includes(transactionIdStr)) {
                school.transactionIds.push(transaction._id);
                await school.save();
                console.log(`✅ Transaction ${transactionIdStr} added to school (member) ${school._id} (${school.name})`);
              } else {
                console.log(`⚠️ Transaction ${transactionIdStr} already exists in school ${school._id}`);
              }
            } else {
              console.log(`❌ School not found with ID: ${user.schoolId}`);
            }
          } catch (schoolErr) {
            console.error('Error adding transaction to school:', schoolErr);
          }
        }
        
        // Also add transaction to organization/school from transaction itself (for custom packages)
        // This ensures custom packages are linked to the correct organization/school
        if (transaction.organizationId) {
          try {
            const transactionOrg = await OrganizationModel4.findById(transaction.organizationId);
            if (transactionOrg) {
              // Skip if already added above
              const alreadyAdded = 
                (user.organizationId && user.organizationId.toString() === transaction.organizationId.toString()) ||
                (orgAsOwner && orgAsOwner._id.toString() === transaction.organizationId.toString());
              
              if (!alreadyAdded) {
                if (!transactionOrg.transactionIds) {
                  transactionOrg.transactionIds = [];
                }
                const existingIds = transactionOrg.transactionIds.map(id => id.toString());
                if (!existingIds.includes(transactionIdStr)) {
                  transactionOrg.transactionIds.push(transaction._id);
                  await transactionOrg.save();
                  console.log(`✅ Transaction ${transactionIdStr} added to organization (from transaction) ${transactionOrg._id} (${transactionOrg.name})`);
                }
              }
            }
          } catch (txOrgErr) {
            console.error('Error adding transaction to organization (from transaction):', txOrgErr);
          }
        }
        
        if (transaction.schoolId) {
          try {
            const transactionSchool = await SchoolModel4.findById(transaction.schoolId);
            if (transactionSchool) {
              // Skip if already added above
              const alreadyAdded = 
                (user.schoolId && user.schoolId.toString() === transaction.schoolId.toString()) ||
                (schoolAsOwner && schoolAsOwner._id.toString() === transaction.schoolId.toString());
              
              if (!alreadyAdded) {
                if (!transactionSchool.transactionIds) {
                  transactionSchool.transactionIds = [];
                }
                const existingIds = transactionSchool.transactionIds.map(id => id.toString());
                if (!existingIds.includes(transactionIdStr)) {
                  transactionSchool.transactionIds.push(transaction._id);
                  await transactionSchool.save();
                  console.log(`✅ Transaction ${transactionIdStr} added to school (from transaction) ${transactionSchool._id} (${transactionSchool.name})`);
                }
              }
            }
          } catch (txSchoolErr) {
            console.error('Error adding transaction to school (from transaction):', txSchoolErr);
          }
        }

        // Send transaction success email
        try {
          let organization = null;
          if (transaction.organizationId) {
            // Organization already declared above at line 444
            organization = await Organization.findById(transaction.organizationId);
          }
          // For custom packages, pass customPackage instead of package
          // For physical products (directProductPurchase), package is null, pass empty object
          const packageForEmail = customPackage || package || {};
          // For direct product purchases (shop page or Products page), fetch product details for email
          let productForEmail = null;
          if (directProductPurchase && transaction.productId) {
            const Product = require('../models/Product');
            productForEmail = await Product.findById(transaction.productId).select('title name description price');
          }
          // Detect shop page or Products page purchase for email service
          // Shop page: b2c_purchase with productId and no packageId
          // Products page: directProductPurchase with productId, packageType digital/digital_physical, and no packageId
          const isShopPagePurchaseForEmail = (transaction.type === 'b2c_purchase' || 
                                             (directProductPurchase && transaction.packageType && 
                                              (transaction.packageType === 'digital' || transaction.packageType === 'digital_physical'))) &&
                                            !transaction.packageId && 
                                            !transaction.customPackageId && 
                                            transaction.productId;
          await sendTransactionSuccessEmail(transaction, user, packageForEmail, organization, productForEmail, isShopPagePurchaseForEmail);
        } catch (emailError) {
          console.error('Error sending transaction success email:', emailError);
          // Don't fail the transaction if email fails
        }

        console.log('Transaction created and membership added for checkout session:', session.id);
      } else {
        // Transaction already exists - update with webhook data if not already set
        if (transaction && (!transaction.webhookData || !transaction.webhookEventType)) {
          console.log('📝 Updating existing transaction with webhook data:', {
            transactionId: transaction._id,
            stripePaymentIntentId: transaction.stripePaymentIntentId,
            webhookEventType: event.type,
            webhookEventId: event.id
          });

          transaction.webhookData = webhookEventData;
          transaction.webhookEventType = event.type;
          transaction.webhookReceivedAt = new Date();
          await transaction.save();

          console.log('✅ Transaction updated with webhook data:', {
            transactionId: transaction._id,
            webhookEventType: event.type
          });
        } else {
          console.log('Transaction already exists for checkout session:', session.id);
        }
      }
    } else if (event.type === 'payment_intent.succeeded') {
      // Also handle payment_intent.succeeded for backward compatibility
      const paymentIntent = event.data.object;
      
      // Check if transaction already exists
      let transaction = await Transaction.findOne({
        stripePaymentIntentId: paymentIntent.id,
      });

      // If transaction already exists (created via fallback), update it with webhook data
      if (transaction) {
        console.log('📝 Transaction already exists (payment_intent), updating with webhook data:', {
          transactionId: transaction._id,
          stripePaymentIntentId: transaction.stripePaymentIntentId,
          webhookEventType: event.type,
          webhookEventId: event.id
        });

        // Update transaction with webhook data
        transaction.webhookData = webhookEventData;
        transaction.webhookEventType = event.type;
        transaction.webhookReceivedAt = new Date();
        await transaction.save();

        console.log('✅ Transaction updated with webhook data (payment_intent):', {
          transactionId: transaction._id,
          webhookEventType: event.type
        });

        // Return early since transaction already exists
        return res.json({ received: true, processed: true, updated: true });
      }

      // Try to get checkout session from payment intent metadata or retrieve it
      let session = null;
      let sessionMetadata = paymentIntent.metadata || {};
      
      // Try to retrieve checkout session if we have session ID in metadata
      if (paymentIntent.metadata?.checkout_session_id) {
        try {
          session = await stripe.checkout.sessions.retrieve(paymentIntent.metadata.checkout_session_id);
          sessionMetadata = session.metadata || {};
          console.log('✅ Retrieved checkout session from payment intent metadata:', {
            sessionId: session.id,
            paymentIntentId: paymentIntent.id
          });
        } catch (err) {
          console.warn('⚠️ Could not retrieve checkout session:', err.message);
        }
      }
      
      // If no session, try to find by payment intent ID in checkout sessions
      if (!session) {
        try {
          const sessions = await stripe.checkout.sessions.list({
            payment_intent: paymentIntent.id,
            limit: 1
          });
          if (sessions.data && sessions.data.length > 0) {
            session = sessions.data[0];
            sessionMetadata = session.metadata || {};
            console.log('✅ Found checkout session by payment intent ID:', {
              sessionId: session.id,
              paymentIntentId: paymentIntent.id
            });
          }
        } catch (err) {
          console.warn('⚠️ Could not find checkout session by payment intent:', err.message);
        }
      }

      // CRITICAL: Use SAME userId resolution logic as fallback flow
      // This ensures webhook behaves identically to transaction-by-session endpoint
      const { userId, source, user } = await resolveUserIdFromCheckout(session, paymentIntent, stripe);
      
      console.log('🔍 resolveUserIdFromCheckout result (payment_intent.succeeded WEBHOOK):', {
        userId,
        source,
        hasUser: !!user,
        paymentIntentId: paymentIntent.id,
        sessionId: session?.id
      });
      
      if (!userId || !user) {
        console.error('❌ Cannot create transaction: userId missing and user not found by any method');
        return res.status(200).json({ 
          received: true, 
          error: 'User not found - userId missing in metadata',
          paymentIntentId: paymentIntent.id,
          source: source
        });
      }

      if (!transaction && userId) {
        const packageId = sessionMetadata?.packageId || paymentIntent.metadata?.packageId;
        const productId = sessionMetadata?.productId || paymentIntent.metadata?.productId || null;
        const uniqueCode = sessionMetadata?.uniqueCode || paymentIntent.metadata?.uniqueCode;
        const billingType = sessionMetadata?.billingType || paymentIntent.metadata?.billingType || 'one_time';
        const directProductPurchase = (sessionMetadata?.directProductPurchase === 'true') || (paymentIntent.metadata?.directProductPurchase === 'true');
        const seatLimit = directProductPurchase ? 1 : (parseInt(sessionMetadata?.seatLimit || paymentIntent.metadata?.seatLimit) || 5);

        // User already fetched by resolveUserIdFromCheckout
        console.log('🔍 User data for transaction (payment_intent WEBHOOK):', {
          userId: user._id,
          source: source,
          schoolId: user.schoolId,
          organizationId: user.organizationId,
          email: user.email
        });
        // Handle direct product purchases (no package required)
        if (directProductPurchase && productId) {
          const Product = require('../models/Product');
          
          // CRITICAL: productId might be string or ObjectId, handle both
          let product = null;
          try {
            // Try to find by ID (handles both string and ObjectId)
            product = await Product.findById(productId);
            if (!product) {
              // If not found, try to find by _id as string
              product = await Product.findOne({ _id: productId });
            }
            if (!product) {
              // Log detailed error for debugging
              console.error('❌ Product not found for direct purchase (payment_intent):', {
                productId,
                productIdType: typeof productId,
                productIdLength: productId?.length,
                paymentIntentId: paymentIntent.id,
                sessionMetadata: sessionMetadata,
                paymentIntentMetadata: paymentIntent.metadata
              });
              return res.status(200).json({ received: true, error: 'Product not found', productId });
            }
            console.log('✅ Product found for direct purchase (payment_intent):', {
              productId: product._id,
              productName: product.title || product.name,
              paymentIntentId: paymentIntent.id
            });
          } catch (err) {
            console.error('❌ Error finding product (payment_intent):', {
              error: err.message,
              productId,
              productIdType: typeof productId
            });
            return res.status(200).json({ received: true, error: 'Error finding product', productId });
          }
          
          // Determine transaction type from urlType or user role
          const urlType = sessionMetadata?.urlType || paymentIntent.metadata?.urlType || null;
          let transactionType = 'b2c_purchase';
          if (urlType === 'B2B') {
            transactionType = 'b2b_contract';
          } else if (urlType === 'B2E') {
            transactionType = 'b2e_contract';
          } else if (user.role === 'b2b_user' || user.role === 'b2b_member') {
            transactionType = 'b2b_contract';
          } else if (user.role === 'b2e_user' || user.role === 'b2e_member') {
            transactionType = 'b2e_contract';
          }
          
          const isShopPagePurchase = (sessionMetadata?.shopPagePurchase === 'true') || (paymentIntent.metadata?.shopPagePurchase === 'true');
          const metadataPackageType = sessionMetadata?.packageType || paymentIntent.metadata?.packageType || 'physical';
          const packageType = metadataPackageType;
          
          // Generate unique code for digital products
          let finalUniqueCode = uniqueCode;
          if ((packageType === 'digital' || packageType === 'digital_physical') && !finalUniqueCode) {
            const TransactionModel = require('../models/Transaction');
            let generatedCode = generateUniqueCode();
            let codeExists = await TransactionModel.findOne({ uniqueCode: generatedCode });
            while (codeExists) {
              generatedCode = generateUniqueCode();
              codeExists = await TransactionModel.findOne({ uniqueCode: generatedCode });
            }
            finalUniqueCode = generatedCode;
          }
          
          // Get organizationId or schoolId from user
          const organizationId = user.organizationId || null;
          const schoolId = user.schoolId || null;
          
          // Check if user is owner of school/organization
          const OrganizationModel = require('../models/Organization');
          const SchoolModel = require('../models/School');
          let ownerOrgId = null;
          let ownerSchoolId = null;
          
          try {
            const orgAsOwner = await OrganizationModel.findOne({ ownerId: user._id });
            if (orgAsOwner) ownerOrgId = orgAsOwner._id;
          } catch (e) {}
          
          try {
            const schoolAsOwner = await SchoolModel.findOne({ ownerId: user._id });
            if (schoolAsOwner) ownerSchoolId = schoolAsOwner._id;
          } catch (e) {}
          
          // Calculate expiry date (1 year for direct product purchases)
          const purchaseDate = new Date();
          const expiryDate = new Date(purchaseDate);
          expiryDate.setFullYear(expiryDate.getFullYear() + 1);
          const contractEndDate = setEndOfDay(expiryDate);
          
          transaction = await Transaction.create({
            type: transactionType,
            userId: userId,
            organizationId: organizationId || ownerOrgId,
            schoolId: schoolId || ownerSchoolId,
            packageId: undefined, // No package for direct product purchases
            customPackageId: undefined,
            packageType: packageType,
            productId: productId,
            amount: paymentIntent.amount / 100,
            currency: 'USD', // Always USD, not PKR or other currencies
            status: 'paid',
            paymentProvider: 'stripe',
            stripePaymentIntentId: paymentIntent.id,
            uniqueCode: (packageType === 'physical') ? undefined : finalUniqueCode,
            maxSeats: seatLimit,
            usedSeats: 0,
            codeApplications: 0,
            gamePlays: [],
            referrals: [],
            contractPeriod: {
              startDate: purchaseDate,
              endDate: contractEndDate,
            },
            webhookData: webhookEventData,
            webhookEventType: event.type,
            webhookReceivedAt: new Date(),
          });
          
          console.log('✅ Transaction created via webhook (payment_intent.succeeded - direct product) with webhook data:', {
            transactionId: transaction._id,
            webhookEventType: event.type,
            webhookEventId: event.id,
            stripePaymentIntentId: transaction.stripePaymentIntentId,
            productId: productId,
            packageType: packageType
          });
          
          return res.json({ received: true, processed: true });
        }
        
        // Handle regular package purchases
        if (!packageId) {
          console.error('Neither packageId nor directProductPurchase found in payment_intent metadata');
          return res.status(200).json({ received: true, error: 'Package ID or direct product purchase required' });
        }
        
        const package = await Package.findById(packageId);
        
        if (!package) {
          console.error('Package not found:', packageId);
          return res.status(200).json({ received: true, error: 'Package not found' });
        }
        
        // Fetch product if productId is provided
        let product = null;
        if (productId) {
          const Product = require('../models/Product');
          product = await Product.findById(productId);
        }

        if (user && package) {
          // Determine transaction type based on package targetAudiences or product targetAudience
          const transactionType = getTransactionType(package, product);

          // Get package type (prefer packageType, fallback to type)
          const packageType = package.packageType || package.type || 'standard';

          // Get organizationId or schoolId from user if they have one
          const organizationId = user.organizationId || null;
          const schoolId = user.schoolId || null;
          
          // Also check if user is owner of school/organization
          const OrganizationModel = require('../models/Organization');
          const SchoolModel = require('../models/School');
          let ownerOrgId = null;
          let ownerSchoolId = null;
          
          try {
            const orgAsOwner = await OrganizationModel.findOne({ ownerId: user._id });
            if (orgAsOwner) ownerOrgId = orgAsOwner._id;
          } catch (e) {}
          
          try {
            const schoolAsOwner = await SchoolModel.findOne({ ownerId: user._id });
            if (schoolAsOwner) ownerSchoolId = schoolAsOwner._id;
          } catch (e) {}

          transaction = await Transaction.create({
            type: transactionType,
            userId: userId,
            organizationId: organizationId || ownerOrgId, // Set organizationId from user or owner
            schoolId: schoolId || ownerSchoolId, // Set schoolId from user or owner
            packageId: packageId,
            packageType: packageType,
            productId: productId || null,
            amount: paymentIntent.amount / 100,
            currency: 'USD', // Always USD, not PKR or other currencies
            status: 'paid',
            paymentProvider: 'stripe',
            stripePaymentIntentId: paymentIntent.id,
            uniqueCode: uniqueCode,
            maxSeats: package.maxSeats || 5, // Dynamic maxSeats from package
            usedSeats: 0,
            codeApplications: 0,
            gamePlays: [],
            referrals: [],
            contractPeriod: {
              startDate: new Date(),
              endDate: (() => {
                const calculatedExpiryDate = calculateExpiryDate(package, new Date());
                if (calculatedExpiryDate) {
                  return setEndOfDay(calculatedExpiryDate);
                }
                // Fallback to subscription default (1 year) or null for one-time
                return billingType === 'subscription'
                  ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                  : null;
              })(),
            },
            // Store complete webhook event data
            webhookData: webhookEventData,
            webhookEventType: event.type,
            webhookReceivedAt: new Date(),
          });

          console.log('✅ Transaction created via webhook (payment_intent.succeeded) with webhook data:', {
            transactionId: transaction._id,
            webhookEventType: event.type,
            webhookEventId: event.id,
            stripePaymentIntentId: transaction.stripePaymentIntentId
          });

          // Determine membership type based on package targetAudiences or product targetAudience
          const membershipType = getMembershipType(package, product);

          // Determine membership end date - use calculated expiry date from expiryTime or expiryDate
          let membershipEndDate = transaction.contractPeriod.endDate;
          const calculatedExpiryDate = calculateExpiryDate(package, transaction.contractPeriod.startDate);
          if (calculatedExpiryDate) {
            membershipEndDate = calculatedExpiryDate;
          }

          user.memberships.push({
            packageId: packageId,
            membershipType: membershipType,
            status: 'active',
            startDate: transaction.contractPeriod.startDate,
            endDate: membershipEndDate,
          });
          await user.save();

          // Add transaction to organization/school's transactionIds array
          // Check both user.organizationId and user.schoolId separately
          // Use OrganizationModel3 and SchoolModel3 to avoid redeclaration
          
          // If user has organizationId, add to organization
          if (user.organizationId) {
            try {
              const organization = await OrganizationModel3.findById(user.organizationId);
              if (organization) {
                // Initialize transactionIds if it doesn't exist
                if (!organization.transactionIds) {
                  organization.transactionIds = [];
                }
                // Convert both to string for comparison
                const transactionIdStr = transaction._id.toString();
                const existingIds = organization.transactionIds.map(id => id.toString());
                if (!existingIds.includes(transactionIdStr)) {
                  organization.transactionIds.push(transaction._id);
                  await organization.save();
                  console.log(`✅ Transaction ${transactionIdStr} added to organization ${organization._id} (${organization.name})`);
                } else {
                  console.log(`⚠️ Transaction ${transactionIdStr} already exists in organization ${organization._id}`);
                }
              } else {
                console.log(`❌ Organization not found with ID: ${user.organizationId}`);
              }
            } catch (orgErr) {
              console.error('Error adding transaction to organization:', orgErr);
            }
          }
          
          // If user has schoolId, add to school
          if (user.schoolId) {
            try {
              const school = await SchoolModel3.findById(user.schoolId);
              if (school) {
                // Initialize transactionIds if it doesn't exist
                if (!school.transactionIds) {
                  school.transactionIds = [];
                }
                // Convert both to string for comparison
                const transactionIdStr = transaction._id.toString();
                const existingIds = school.transactionIds.map(id => id.toString());
                if (!existingIds.includes(transactionIdStr)) {
                  school.transactionIds.push(transaction._id);
                  await school.save();
                  console.log(`✅ Transaction ${transactionIdStr} added to school ${school._id} (${school.name})`);
                } else {
                  console.log(`⚠️ Transaction ${transactionIdStr} already exists in school ${school._id}`);
                }
              } else {
                console.log(`❌ School not found with ID: ${user.schoolId}`);
              }
            } catch (schoolErr) {
              console.error('Error adding transaction to school:', schoolErr);
            }
          } else {
            console.log('ℹ️ User does not have schoolId:', user._id);
          }

          // Update GameProgress isDemo to false when user makes a purchase
          // This allows demo users who purchase to see their game progress
          try {
            const GameProgress = require('../models/GameProgress');
            await GameProgress.updateMany(
              { userId: userId, isDemo: true },
              { $set: { isDemo: false } }
            );
            console.log(`✅ Updated GameProgress isDemo to false for user ${userId} after purchase (payment_intent.succeeded)`);
          } catch (gameProgressError) {
            console.error('Error updating GameProgress isDemo:', gameProgressError);
            // Don't fail the transaction if this update fails
          }

          // Send transaction success email
          try {
            let organization = null;
            if (transaction.organizationId) {
              // Use OrganizationModel3 already declared above
              organization = await OrganizationModel3.findById(transaction.organizationId);
            }
            // For shop page or Products page purchases, fetch product details for email (all product types)
            let productForEmail = null;
            const isShopPagePurchaseForEmail = (transaction.type === 'b2c_purchase' || 
                                               (transaction.packageType && 
                                                (transaction.packageType === 'digital' || transaction.packageType === 'digital_physical'))) &&
                                              !transaction.packageId && 
                                              !transaction.customPackageId && 
                                              transaction.productId;
            if (isShopPagePurchaseForEmail && transaction.productId) {
              const Product = require('../models/Product');
              productForEmail = await Product.findById(transaction.productId).select('title name description price');
              console.log('📦 Fetched product for email (webhook):', {
                productId: transaction.productId,
                productTitle: productForEmail?.title,
                productName: productForEmail?.name,
                packageType: transaction.packageType
              });
            } else if (transaction.packageType === 'physical' && transaction.productId) {
              const Product = require('../models/Product');
              productForEmail = await Product.findById(transaction.productId).select('title name description price');
            }
            await sendTransactionSuccessEmail(transaction, user, package || {}, organization, productForEmail, isShopPagePurchaseForEmail);
          } catch (emailError) {
            console.error('Error sending transaction success email:', emailError);
            // Don't fail the transaction if email fails
          }
        }
      }
    }

    // Return success response to Stripe
    res.json({ received: true, processed: true });
    
    console.log('✅ Webhook processed successfully:', {
      eventType: event.type,
      eventId: event.id,
      processedAt: new Date()
    });
  } catch (error) {
    console.error('❌ Error processing webhook:', {
      error: error.message,
      stack: error.stack,
      eventType: event?.type,
      eventId: event?.id
    });
    res.status(500).json({ error: 'Webhook processing failed', message: error.message });
  }
});

// Get transaction by unique code
router.get('/transaction/:code', authenticateToken, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      uniqueCode: req.params.code,
      userId: req.userId,
    })
      .populate('packageId', 'name')
      .populate('userId', 'name email');

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found. Payment may still be processing.' });
    }

    res.json(transaction);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Test webhook endpoint (GET) - to verify endpoint is accessible
router.get('/webhook', (req, res) => {
  res.json({ 
    message: 'Webhook endpoint is accessible',
    timestamp: new Date().toISOString(),
    method: 'GET',
    note: 'Stripe will POST to this endpoint, not GET'
  });
});

// Get transaction by checkout session ID (with fallback to create if payment succeeded)
router.get('/transaction-by-session/:sessionId', authenticateToken, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured' });
    }

    // Retrieve checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    
    // Find transaction by payment intent or session ID
    let transaction = await Transaction.findOne({
      $or: [
        { stripePaymentIntentId: session.payment_intent },
        { stripePaymentIntentId: session.id },
      ],
    })
      .populate('packageId', 'name')
      .populate('userId', 'name email');

      // FALLBACK METHOD COMMENTED OUT - Only webhook creates transactions now
    // If transaction doesn't exist but payment is complete, wait for webhook (don't create via fallback)
    /*
    if (!transaction && session.payment_status === 'paid') {
        const userId = session.metadata.userId;
        const packageId = session.metadata.packageId || null;
        const customPackageId = session.metadata.customPackageId || null;
        let uniqueCode = session.metadata.uniqueCode || null;
        const billingType = session.metadata.billingType || 'one_time';
        const directProductPurchase = session.metadata.directProductPurchase === 'true';

        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        let package = null;
        let customPackage = null;
        
        // Handle direct product purchase (no package required)
        if (directProductPurchase) {
          // For direct product purchases, we don't need packageId or customPackageId
          // Transaction will be created with packageId as null
        } else if (customPackageId) {
          // Handle custom package or regular package
          const CustomPackage = require('../models/CustomPackage');
          customPackage = await CustomPackage.findById(customPackageId)
            .populate('basePackageId')
            .populate('organizationId')
            .populate('schoolId');
          
          if (!customPackage) {
            return res.status(404).json({ error: 'Custom package not found' });
          }
        } else if (packageId) {
          package = await Package.findById(packageId);
          if (!package) {
            return res.status(404).json({ error: 'Package not found' });
          }
        } else {
          return res.status(400).json({ error: 'Package ID or Custom Package ID required' });
        }
      
      // Fetch product if productId is provided
      const productId = session.metadata.productId || null;
      let product = null;
      if (productId) {
        const Product = require('../models/Product');
        product = await Product.findById(productId);
      }

      // Handle both custom packages, regular packages, and direct product purchases
      if (user && (package || customPackage || directProductPurchase)) {
        // For regular packages, check if user already has this package
        let shouldCreateTransaction = true;
        if (package) {
          const existingMembership = user.memberships.find(
            (m) => m.packageId.toString() === packageId && m.status === 'active'
          );
          if (existingMembership) {
            shouldCreateTransaction = false;
          }
        }
        
        // For custom packages, check if already purchased
        if (customPackage) {
          const existingTransaction = await Transaction.findOne({
            $or: [
              { organizationId: customPackage.organizationId, customPackageId: customPackage._id, status: 'paid' },
              { schoolId: customPackage.schoolId, customPackageId: customPackage._id, status: 'paid' }
            ]
          });
          if (existingTransaction) {
            shouldCreateTransaction = false;
            transaction = existingTransaction;
          }
        }

        if (shouldCreateTransaction) {
          // Get payment amount from session
          const amount = session.amount_total ? session.amount_total / 100 : session.amount_subtotal / 100;
          // CRITICAL: Always use USD for transactions, not PKR or other currencies
          const currency = 'USD';

          let transactionType = 'b2c_purchase';
          let packageType = 'standard';
          let maxSeats = 5;
          let contractEndDate = null;
          let organizationId = null;
          let schoolId = null;
          let uniqueCode = null; // Initialize uniqueCode for fallback transaction
          const purchaseDateForRenewal = new Date(); // Purchase date for this transaction

          // Handle custom package
          if (customPackage) {
            // Determine transaction type based on organization/school
            const Organization = require('../models/Organization');
            if (customPackage.organizationId) {
              const org = await Organization.findById(customPackage.organizationId);
              transactionType = org?.segment === 'B2B' ? 'b2b_contract' : 'b2e_contract';
              organizationId = customPackage.organizationId._id || customPackage.organizationId;
            } else if (customPackage.schoolId) {
              transactionType = 'b2e_contract';
              schoolId = customPackage.schoolId._id || customPackage.schoolId;
            }

            packageType = 'custom'; // Set packageType to 'custom' for custom packages
            maxSeats = customPackage.seatLimit || 5;
            contractEndDate = customPackage.contract?.endDate || null;

            // Generate unique code for custom packages (except physical)
            const metadataUniqueCode = session.metadata.uniqueCode;
            const hasValidUniqueCode = metadataUniqueCode && metadataUniqueCode !== '' && metadataUniqueCode !== 'null' && metadataUniqueCode !== 'undefined';
            
            // Custom packages always need unique codes (except if explicitly physical)
            if (packageType === 'custom' || packageType === 'digital' || packageType === 'digital_physical') {
              if (hasValidUniqueCode) {
                uniqueCode = metadataUniqueCode;
                console.log('✅ FALLBACK: Using unique code from metadata for custom package:', {
                  customPackageId: customPackage._id,
                  packageType: packageType,
                  uniqueCode: uniqueCode
                });
              } else {
                uniqueCode = generateUniqueCode();
                let codeExists = await Transaction.findOne({ uniqueCode });
                while (codeExists) {
                  uniqueCode = generateUniqueCode();
                  codeExists = await Transaction.findOne({ uniqueCode });
                }
                console.log('✅ FALLBACK: Generated unique code for custom package purchase:', {
                  customPackageId: customPackage._id,
                  packageType: packageType,
                  generatedUniqueCode: uniqueCode
                });
              }
            } else if (packageType === 'physical') {
              uniqueCode = undefined;
              console.log('⚠️ FALLBACK: No unique code for physical custom package:', {
                customPackageId: customPackage._id,
                packageType: packageType
              });
            } else {
              // For other package types (standard, renewal), generate unique code
              if (!hasValidUniqueCode) {
                uniqueCode = generateUniqueCode();
                let codeExists = await Transaction.findOne({ uniqueCode });
                while (codeExists) {
                  uniqueCode = generateUniqueCode();
                  codeExists = await Transaction.findOne({ uniqueCode });
                }
                console.log('✅ FALLBACK: Generated unique code for standard custom package purchase:', {
                  customPackageId: customPackage._id,
                  packageType: packageType,
                  generatedUniqueCode: uniqueCode
                });
              } else {
                uniqueCode = metadataUniqueCode;
              }
            }

            // Activate custom package
            customPackage.status = 'active';
            customPackage.contract.status = 'active';
            await customPackage.save();
          } else if (package) {
            // Handle regular package
            // Determine transaction type based on USER ROLE (not product/package targetAudience)
            // This ensures transaction type matches the user who is purchasing
            if (user.role === 'b2c_user') {
              transactionType = 'b2c_purchase';
            } else if (user.role === 'b2b_user' || user.role === 'b2b_member') {
              transactionType = 'b2b_contract';
            } else if (user.role === 'b2e_user' || user.role === 'b2e_member') {
              transactionType = 'b2e_contract';
            } else {
              // Fallback to product/package targetAudience if role doesn't match
              transactionType = getTransactionType(package, product);
            }
            packageType = package.packageType || package.type || package.category || 'standard';
            
            // CRITICAL FIX: If productId is present, check product to determine packageType for digital/digital_physical
            // This handles Products page purchases where package might have 'standard' type but product is digital
            if (productId && product) {
              const productTitle = (product.title || product.name || '').toLowerCase();
              const isDigitalProduct = productTitle.includes('digital') || productTitle.includes('extension');
              const isBundleProduct = productTitle.includes('bundle') || productTitle.includes('full') || productTitle.includes('best value');
              const isPhysicalProduct = productTitle.includes('physical') || productTitle.includes('tactical');
              
              // Override packageType based on product if package type is 'standard' or doesn't indicate digital
              if (packageType === 'standard' || (!packageType || packageType === null)) {
                if (isDigitalProduct) {
                  packageType = 'digital';
                  console.log('🔧 FALLBACK: Override packageType to "digital" based on product:', {
                    productId: product._id,
                    productTitle: product.title || product.name,
                    originalPackageType: package.packageType || package.type,
                    newPackageType: packageType
                  });
                } else if (isBundleProduct) {
                  packageType = 'digital_physical';
                  console.log('🔧 FALLBACK: Override packageType to "digital_physical" based on product:', {
                    productId: product._id,
                    productTitle: product.title || product.name,
                    originalPackageType: package.packageType || package.type,
                    newPackageType: packageType
                  });
                } else if (isPhysicalProduct) {
                  packageType = 'physical';
                }
              }
            }
            
            console.log('📦 FALLBACK: Final packageType determined for package purchase:', {
              packageId: package._id,
              packageName: package.name,
              packageTypeFromPackage: package.packageType,
              packageTypeFromType: package.type,
              packageTypeFromCategory: package.category,
              productId: productId,
              productName: product?.title || product?.name,
              finalPackageType: packageType
            });
            
            maxSeats = package.maxSeats || 5;
            // Calculate expiry date from expiryTime or use expiryDate (backward compatibility)
            // Use purchase date (current date) as start date
            const calculatedExpiryDate = calculateExpiryDate(package, purchaseDateForRenewal);
            contractEndDate = calculatedExpiryDate ? setEndOfDay(calculatedExpiryDate) : null;
            console.log('✅ Calculated expiry date for renewal package:', {
              packageId: package._id,
              packageName: package.name,
              expiryTime: package.expiryTime,
              expiryTimeUnit: package.expiryTimeUnit,
              startDate: purchaseDateForRenewal,
              endDate: contractEndDate
            });
            
            // CRITICAL: Generate unique code for digital/digital_physical packages
            // Check metadata first, then generate if needed
            const metadataUniqueCode = session.metadata.uniqueCode;
            const hasValidUniqueCode = metadataUniqueCode && metadataUniqueCode !== '' && metadataUniqueCode !== 'null' && metadataUniqueCode !== 'undefined';
            
            if (packageType === 'digital' || packageType === 'digital_physical') {
              if (hasValidUniqueCode) {
                uniqueCode = metadataUniqueCode;
                console.log('✅ FALLBACK: Using unique code from metadata for package purchase:', {
                  packageId: package._id,
                  packageType: packageType,
                  uniqueCode: uniqueCode
                });
              } else {
                // Generate new unique code
                uniqueCode = generateUniqueCode();
                let codeExists = await Transaction.findOne({ uniqueCode });
                while (codeExists) {
                  uniqueCode = generateUniqueCode();
                  codeExists = await Transaction.findOne({ uniqueCode });
                }
                console.log('✅ FALLBACK: Generated unique code for digital package purchase:', {
                  packageId: package._id,
                  packageName: package.name,
                  packageType: packageType,
                  generatedUniqueCode: uniqueCode
                });
              }
            } else if (packageType === 'physical') {
              uniqueCode = undefined;
              console.log('⚠️ FALLBACK: No unique code for physical package:', {
                packageId: package._id,
                packageType: packageType
              });
            } else {
              // For other package types (standard, renewal), generate unique code by default
              if (!hasValidUniqueCode) {
                uniqueCode = generateUniqueCode();
                let codeExists = await Transaction.findOne({ uniqueCode });
                while (codeExists) {
                  uniqueCode = generateUniqueCode();
                  codeExists = await Transaction.findOne({ uniqueCode });
                }
                console.log('✅ FALLBACK: Generated unique code for standard package purchase:', {
                  packageId: package._id,
                  packageType: packageType,
                  generatedUniqueCode: uniqueCode
                });
              } else {
                uniqueCode = metadataUniqueCode;
              }
            }
            
            // Get organizationId or schoolId from user if they have one
            organizationId = user.organizationId || null;
            schoolId = user.schoolId || null;
          } else if (directProductPurchase) {
            // Handle direct product purchase (for shop page products)
            const ProductForTransaction = require('../models/Product');
            const productForTransaction = await ProductForTransaction.findById(productId);
            
            if (!productForTransaction) {
              return res.status(404).json({ error: 'Product not found' });
            }
            
            // Check if this is a shop page purchase from metadata or detect from referrer
            let isShopPagePurchaseFromMetadata = session.metadata.shopPagePurchase === 'true';
            
            // Also try to detect from referrer URL if metadata is not available
            if (!isShopPagePurchaseFromMetadata && session.metadata.referrerUrl) {
              const referrerUrl = session.metadata.referrerUrl.toLowerCase();
              isShopPagePurchaseFromMetadata = referrerUrl.includes('sskit-family');
            }
            
            // Get packageType and maxSeats from metadata if shop page purchase
            const metadataPackageType = session.metadata.packageType || null;
            const metadataMaxSeats = session.metadata.maxSeats ? parseInt(session.metadata.maxSeats) : null;
            
            if (isShopPagePurchaseFromMetadata && metadataPackageType) {
              // Shop page purchase - use metadata values
              packageType = metadataPackageType;
              if (metadataMaxSeats !== null && !isNaN(metadataMaxSeats)) {
                maxSeats = metadataMaxSeats;
              } else {
                // Default based on packageType
                if (packageType === 'physical') {
                  maxSeats = 0;
                } else if (packageType === 'digital' || packageType === 'digital_physical') {
                  maxSeats = 1;
                } else {
                  maxSeats = 1;
                }
              }
              
              // Generate unique code for digital and bundle products
              if (packageType === 'digital' || packageType === 'digital_physical') {
                // Check if uniqueCode was already generated in metadata
                const metadataUniqueCode = session.metadata.uniqueCode;
                if (metadataUniqueCode && metadataUniqueCode !== '' && metadataUniqueCode !== 'null') {
                  uniqueCode = metadataUniqueCode;
                } else {
                  // Generate new unique code (generateUniqueCode function is defined at top of file)
                  uniqueCode = generateUniqueCode();
                  let codeExists = await Transaction.findOne({ uniqueCode });
                  while (codeExists) {
                    uniqueCode = generateUniqueCode();
                    codeExists = await Transaction.findOne({ uniqueCode });
                  }
                }
              } else {
                uniqueCode = undefined; // No unique code for physical products
              }
              
              console.log('✅ Shop page purchase detected in fallback:', {
                productId: productForTransaction._id,
                packageType: packageType,
                maxSeats: maxSeats,
                hasUniqueCode: !!uniqueCode
              });
            } else if (metadataPackageType) {
              // Products page purchase (not shop page) - use metadata packageType
              packageType = metadataPackageType;
              if (metadataMaxSeats !== null && !isNaN(metadataMaxSeats)) {
                maxSeats = metadataMaxSeats;
              } else {
                // Default based on packageType
                if (packageType === 'physical') {
                  maxSeats = 0;
                } else if (packageType === 'digital' || packageType === 'digital_physical') {
                  maxSeats = 1;
                } else {
                  maxSeats = 1;
                }
              }
              
              // Generate unique code for digital and bundle products from Products page
              if (packageType === 'digital' || packageType === 'digital_physical') {
                // Check if uniqueCode was already generated in metadata
                const metadataUniqueCode = session.metadata.uniqueCode;
                if (metadataUniqueCode && metadataUniqueCode !== '' && metadataUniqueCode !== 'null') {
                  uniqueCode = metadataUniqueCode;
                } else {
                  // Generate new unique code
                  uniqueCode = generateUniqueCode();
                  let codeExists = await Transaction.findOne({ uniqueCode });
                  while (codeExists) {
                    uniqueCode = generateUniqueCode();
                    codeExists = await Transaction.findOne({ uniqueCode });
                  }
                }
              } else {
                uniqueCode = undefined; // No unique code for physical products
              }
              
              console.log('✅ Products page purchase detected in fallback:', {
                productId: productForTransaction._id,
                packageType: packageType,
                maxSeats: maxSeats,
                hasUniqueCode: !!uniqueCode
              });
            } else {
              // Regular direct product purchase (not from shop page or products page)
              packageType = 'physical'; // Set to 'physical' for tactical card purchases
              maxSeats = 0; // Physical products have 0 seats (no digital access)
              uniqueCode = undefined; // No unique code for physical products
            }
            
            // Determine transaction type based on urlType from session metadata
            const urlType = session.metadata.urlType || null;
            if (urlType === 'B2B') {
              transactionType = 'b2b_contract';
            } else if (urlType === 'B2E') {
              transactionType = 'b2e_contract';
            } else if (urlType === 'B2C') {
              transactionType = 'b2c_purchase';
            } else {
              // Fallback: determine from user role if urlType is not available
              if (user.role === 'b2b_user' || user.role === 'b2b_member') {
                transactionType = 'b2b_contract';
              } else if (user.role === 'b2e_user' || user.role === 'b2e_member') {
                transactionType = 'b2e_contract';
              } else {
                transactionType = 'b2c_purchase';
              }
            }
            
            // For all direct product purchases, typically 1 year expiry
            const expiryDate = new Date(purchaseDateForRenewal);
            expiryDate.setFullYear(expiryDate.getFullYear() + 1); // 1 year from purchase
            contractEndDate = setEndOfDay(expiryDate);
            
            organizationId = user.organizationId || null;
            schoolId = user.schoolId || null;
          }
          
          // Also check if user is owner of school/organization
          const OrganizationModel3 = require('../models/Organization');
          const SchoolModel3 = require('../models/School');
          let ownerOrgId = null;
          let ownerSchoolId = null;
          
          try {
            const orgAsOwner = await OrganizationModel3.findOne({ ownerId: user._id });
            if (orgAsOwner) ownerOrgId = orgAsOwner._id;
          } catch (e) {}
          
          try {
            const schoolAsOwner = await SchoolModel3.findOne({ ownerId: user._id });
            if (schoolAsOwner) ownerSchoolId = schoolAsOwner._id;
          } catch (e) {}
          
          console.log('🔍 Fallback transaction - User data:', {
            userId: user?._id,
            schoolId: schoolId || user?.schoolId || ownerSchoolId,
            organizationId: organizationId || user?.organizationId || ownerOrgId,
            email: user?.email,
            isCustomPackage: !!customPackage,
            packageType: packageType,
            hasUniqueCode: !!uniqueCode
          });

          // FINAL SAFETY CHECK: Ensure unique code is generated for digital/digital_physical packages and custom packages (except physical)
          // This MUST happen before Transaction.create() in fallback path
          if (customPackage && packageType !== 'physical' && (!uniqueCode || uniqueCode === null || uniqueCode === undefined || uniqueCode === '')) {
            console.log('🚨 CRITICAL FALLBACK: Unique code missing for custom package, generating now BEFORE transaction creation...', {
              customPackageId: customPackage._id,
              customPackageName: customPackage.name,
              packageType: packageType,
              currentUniqueCode: uniqueCode
            });
            let generatedCode = generateUniqueCode();
            let codeExists = await Transaction.findOne({ uniqueCode: generatedCode });
            while (codeExists) {
              generatedCode = generateUniqueCode();
              codeExists = await Transaction.findOne({ uniqueCode: generatedCode });
            }
            uniqueCode = generatedCode;
            console.log('✅ CRITICAL FALLBACK FIX: Generated unique code for custom package BEFORE transaction creation:', {
              customPackageId: customPackage._id,
              customPackageName: customPackage.name,
              packageType: packageType,
              generatedUniqueCode: uniqueCode
            });
          } else if ((packageType === 'digital' || packageType === 'digital_physical') && (!uniqueCode || uniqueCode === null || uniqueCode === undefined || uniqueCode === '')) {
            console.log('🚨 CRITICAL FALLBACK: Unique code missing for digital package, generating now BEFORE transaction creation...', {
              packageId: package?._id,
              packageName: package?.name,
              packageType: packageType,
              productId: productId,
              currentUniqueCode: uniqueCode
            });
            let generatedCode = generateUniqueCode();
            let codeExists = await Transaction.findOne({ uniqueCode: generatedCode });
            while (codeExists) {
              generatedCode = generateUniqueCode();
              codeExists = await Transaction.findOne({ uniqueCode: generatedCode });
            }
            uniqueCode = generatedCode;
            console.log('✅ CRITICAL FALLBACK FIX: Generated unique code for digital package BEFORE transaction creation:', {
              packageId: package?._id,
              packageName: package?.name,
              packageType: packageType,
              generatedUniqueCode: uniqueCode
            });
          }

          // Create transaction
          // For direct product purchases (physical), don't save packageId but save packageType as 'physical' and no uniqueCode
          transaction = await Transaction.create({
            type: transactionType,
            userId: userId,
            organizationId: organizationId || ownerOrgId || (customPackage?.organizationId?._id || customPackage?.organizationId),
            schoolId: schoolId || ownerSchoolId || (customPackage?.schoolId?._id || customPackage?.schoolId),
            // For direct product purchases, packageId is undefined but packageType is 'physical'
            packageId: directProductPurchase ? undefined : (packageId || null),
            customPackageId: directProductPurchase ? undefined : (customPackageId || null),
            packageType: packageType || null, // Package type ('physical' for direct product purchases)
            productId: productId || null,
            amount: amount,
            currency: currency,
            status: 'paid',
            paymentProvider: 'stripe',
            stripePaymentIntentId: session.payment_intent || session.id,
            // For physical products, don't save uniqueCode (no digital access code needed)
            // For digital/digital_physical products (shop page, Products page, or regular packages), save uniqueCode
            uniqueCode: (packageType === 'physical') ? undefined : (uniqueCode || undefined),
            maxSeats: maxSeats,
            usedSeats: 0,
            codeApplications: 0,
            gamePlays: [],
            referrals: [],
            contractPeriod: {
              startDate: purchaseDateForRenewal || new Date(), // Use purchase date
              endDate: contractEndDate || (billingType === 'subscription'
                ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                : null),
          },
        });

        // Update GameProgress isDemo to false when user makes a purchase
        // This allows demo users who purchase to see their game progress
        try {
          const GameProgress = require('../models/GameProgress');
          const updateResult = await GameProgress.updateMany(
            { userId: userId, isDemo: true },
            { $set: { isDemo: false } }
          );
          console.log(`✅ Updated GameProgress isDemo to false for user ${userId} after purchase`);
          console.log(`📊 Updated ${updateResult.modifiedCount} GameProgress document(s) from isDemo: true to isDemo: false`);
        } catch (gameProgressError) {
          console.error('Error updating GameProgress isDemo:', gameProgressError);
          // Don't fail the transaction if this update fails
        }

        // Add membership to user (only for regular packages, not custom packages)
          if (package && !customPackage) {
            // Determine membership type based on package targetAudiences or product targetAudience
            const membershipType = getMembershipType(package, product);
            console.log('🔍 Membership Type Determination (fallback):', {
              productId: productId,
              productTargetAudience: product?.targetAudience,
              packageTargetAudiences: package?.targetAudiences,
              determinedMembershipType: membershipType
            });

            // Determine membership end date - use calculated expiry date from expiryTime or expiryDate
            let membershipEndDate = transaction.contractPeriod.endDate;
            const calculatedExpiryDate = calculateExpiryDate(package, transaction.contractPeriod.startDate);
            if (calculatedExpiryDate) {
              membershipEndDate = calculatedExpiryDate;
            }

            // Add membership to user
            user.memberships.push({
              packageId: packageId,
              membershipType: membershipType,
              status: 'active',
              startDate: transaction.contractPeriod.startDate,
              endDate: membershipEndDate,
            });
            await user.save();
          }

          // Add transaction to organization/school's transactionIds array
          // Use OrganizationModel3 and SchoolModel3 (already declared above)
          
          const transactionIdStr = transaction._id.toString();
          
          // First, check if user is owner of any organization
          try {
            const orgAsOwner = await OrganizationModel3.findOne({ ownerId: user._id });
            if (orgAsOwner) {
              if (!orgAsOwner.transactionIds) {
                orgAsOwner.transactionIds = [];
              }
              const existingIds = orgAsOwner.transactionIds.map(id => id.toString());
              if (!existingIds.includes(transactionIdStr)) {
                orgAsOwner.transactionIds.push(transaction._id);
                await orgAsOwner.save();
                console.log(`✅ Transaction ${transactionIdStr} added to organization (owner) ${orgAsOwner._id} (${orgAsOwner.name}) - FALLBACK`);
              }
            }
          } catch (orgOwnerErr) {
            console.error('Error adding transaction to organization (owner) - FALLBACK:', orgOwnerErr);
          }
          
          // Check if user is owner of any school
          try {
            const schoolAsOwner = await SchoolModel3.findOne({ ownerId: user._id });
            if (schoolAsOwner) {
              if (!schoolAsOwner.transactionIds) {
                schoolAsOwner.transactionIds = [];
              }
              const existingIds = schoolAsOwner.transactionIds.map(id => id.toString());
              if (!existingIds.includes(transactionIdStr)) {
                schoolAsOwner.transactionIds.push(transaction._id);
                await schoolAsOwner.save();
                console.log(`✅ Transaction ${transactionIdStr} added to school (owner) ${schoolAsOwner._id} (${schoolAsOwner.name}) - FALLBACK`);
              }
            }
          } catch (schoolOwnerErr) {
            console.error('Error adding transaction to school (owner) - FALLBACK:', schoolOwnerErr);
          }
          
          // If user has organizationId, add to organization (as member)
          if (user.organizationId) {
            try {
              const organization = await OrganizationModel3.findById(user.organizationId);
              if (organization) {
                // Initialize transactionIds if it doesn't exist
                if (!organization.transactionIds) {
                  organization.transactionIds = [];
                }
                // Convert both to string for comparison
                const existingIds = organization.transactionIds.map(id => id.toString());
                if (!existingIds.includes(transactionIdStr)) {
                  organization.transactionIds.push(transaction._id);
                  await organization.save();
                  console.log(`✅ Transaction ${transactionIdStr} added to organization (member) ${organization._id} (${organization.name}) - FALLBACK`);
                } else {
                  console.log(`⚠️ Transaction ${transactionIdStr} already exists in organization ${organization._id} - FALLBACK`);
                }
              } else {
                console.log(`❌ Organization not found with ID: ${user.organizationId} - FALLBACK`);
              }
            } catch (orgErr) {
              console.error('Error adding transaction to organization (fallback):', orgErr);
            }
          }
          
          // If user has schoolId, add to school (as member)
          if (user.schoolId) {
            try {
              const school = await SchoolModel3.findById(user.schoolId);
              if (school) {
                // Initialize transactionIds if it doesn't exist
                if (!school.transactionIds) {
                  school.transactionIds = [];
                }
                // Convert both to string for comparison
                const existingIds = school.transactionIds.map(id => id.toString());
                if (!existingIds.includes(transactionIdStr)) {
                  school.transactionIds.push(transaction._id);
                  await school.save();
                  console.log(`✅ Transaction ${transactionIdStr} added to school (member) ${school._id} (${school.name}) - FALLBACK`);
                } else {
                  console.log(`⚠️ Transaction ${transactionIdStr} already exists in school ${school._id} - FALLBACK`);
                }
              } else {
                console.log(`❌ School not found with ID: ${user.schoolId} - FALLBACK`);
              }
            } catch (schoolErr) {
              console.error('Error adding transaction to school (fallback):', schoolErr);
            }
          }
          
          // For custom packages, also add transaction to organization/school from custom package
          if (customPackage) {
            if (transaction.organizationId) {
              try {
                const transactionOrg = await OrganizationModel3.findById(transaction.organizationId);
                if (transactionOrg) {
                  // Skip if already added above
                  const alreadyAdded = 
                    (user.organizationId && user.organizationId.toString() === transaction.organizationId.toString()) ||
                    (orgAsOwner && orgAsOwner._id.toString() === transaction.organizationId.toString());
                  
                  if (!alreadyAdded) {
                    if (!transactionOrg.transactionIds) {
                      transactionOrg.transactionIds = [];
                    }
                    const existingIds = transactionOrg.transactionIds.map(id => id.toString());
                    if (!existingIds.includes(transactionIdStr)) {
                      transactionOrg.transactionIds.push(transaction._id);
                      await transactionOrg.save();
                      console.log(`✅ Transaction ${transactionIdStr} added to organization (from custom package) ${transactionOrg._id} (${transactionOrg.name}) - FALLBACK`);
                    }
                  }
                }
              } catch (txOrgErr) {
                console.error('Error adding transaction to organization (from custom package) - FALLBACK:', txOrgErr);
              }
            }
            
            if (transaction.schoolId) {
              try {
                const transactionSchool = await SchoolModel3.findById(transaction.schoolId);
                if (transactionSchool) {
                  // Skip if already added above
                  const alreadyAdded = 
                    (user.schoolId && user.schoolId.toString() === transaction.schoolId.toString()) ||
                    (schoolAsOwner && schoolAsOwner._id.toString() === transaction.schoolId.toString());
                  
                  if (!alreadyAdded) {
                    if (!transactionSchool.transactionIds) {
                      transactionSchool.transactionIds = [];
                    }
                    const existingIds = transactionSchool.transactionIds.map(id => id.toString());
                    if (!existingIds.includes(transactionIdStr)) {
                      transactionSchool.transactionIds.push(transaction._id);
                      await transactionSchool.save();
                      console.log(`✅ Transaction ${transactionIdStr} added to school (from custom package) ${transactionSchool._id} (${transactionSchool.name}) - FALLBACK`);
                    }
                  }
                }
              } catch (txSchoolErr) {
                console.error('Error adding transaction to school (from custom package) - FALLBACK:', txSchoolErr);
              }
            }
          }

          // Send transaction success email
          try {
            let organization = null;
            if (transaction.organizationId) {
              // Use OrganizationModel3 already declared above
              organization = await OrganizationModel3.findById(transaction.organizationId);
            }
            // For custom packages, pass customPackage instead of package
            const packageForEmail = customPackage || package || {};
            // For shop page or Products page purchases, fetch product details for email (all product types)
            let productForEmail = null;
            const isShopPagePurchaseForEmail = (transaction.type === 'b2c_purchase' || 
                                               (transaction.packageType && 
                                                (transaction.packageType === 'digital' || transaction.packageType === 'digital_physical'))) &&
                                              !transaction.packageId && 
                                              !transaction.customPackageId && 
                                              transaction.productId;
            if (isShopPagePurchaseForEmail && transaction.productId) {
              const Product = require('../models/Product');
              productForEmail = await Product.findById(transaction.productId).select('title name description price');
              console.log('📦 Fetched product for email (fallback):', {
                productId: transaction.productId,
                productTitle: productForEmail?.title,
                productName: productForEmail?.name,
                packageType: transaction.packageType
              });
            } else if (transaction.packageType === 'physical' && transaction.productId) {
              const Product = require('../models/Product');
              productForEmail = await Product.findById(transaction.productId).select('title name description price');
            }
            await sendTransactionSuccessEmail(transaction, user, packageForEmail, organization, productForEmail, isShopPagePurchaseForEmail);
          } catch (emailError) {
            console.error('Error sending transaction success email:', emailError);
            // Don't fail the transaction if email fails
          }

          console.log('⚠️ Transaction created via FALLBACK (SECONDARY METHOD) for session:', {
            sessionId: session.id,
            paymentIntentId: session.payment_intent,
            directProductPurchase: directProductPurchase,
            shopPagePurchase: session.metadata?.shopPagePurchase === 'true',
            productsPagePurchase: directProductPurchase && session.metadata?.packageType && session.metadata?.shopPagePurchase !== 'true',
            packageType: session.metadata?.packageType,
            note: 'This should only happen if webhook is delayed or failed. Webhook data will be added when webhook arrives.'
          });
          
          // Populate transaction for response
          transaction = await Transaction.findById(transaction._id)
            .populate('packageId', 'name')
            .populate('customPackageId', 'name')
            .populate('userId', 'name email');
        }
      }
    }
    */
    // END OF FALLBACK METHOD - Transactions now only created via webhook

    if (!transaction) {
      // If still no transaction, return session info
      return res.json({
        status: session.payment_status === 'paid' ? 'processing' : session.payment_status,
        sessionId: session.id,
        paymentStatus: session.payment_status,
        uniqueCode: session.metadata?.uniqueCode,
        message: session.payment_status === 'paid' 
          ? 'Payment completed. Transaction is being processed.' 
          : `Payment status: ${session.payment_status}`,
      });
    }

    // Verify user owns this transaction
    if (transaction.userId && transaction.userId._id.toString() !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(transaction);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check if purchase code is valid (public endpoint, no auth required)
router.get('/check-purchase-code/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const transaction = await Transaction.findOne({
      uniqueCode: code,
    })
      .populate('packageId', 'name description type packageType')
      .populate('customPackageId') // Populate custom package
      .populate('productId', 'name description') // Populate productId
      .populate('userId', 'name email');
    
    // If custom package exists and productId is not set, get it from custom package
    if (transaction?.customPackageId && !transaction.productId) {
      const CustomPackage = require('../models/CustomPackage');
      const customPackage = await CustomPackage.findById(transaction.customPackageId)
        .populate('productIds');
      
      if (customPackage?.productIds && Array.isArray(customPackage.productIds) && customPackage.productIds.length > 0) {
        transaction.productId = customPackage.productIds[0]._id || customPackage.productIds[0].id || customPackage.productIds[0];
        console.log(`✅ Extracted productId from custom package for check: ${transaction.productId}`);
      }
    }

    if (!transaction) {
      return res.json({ valid: false, message: 'Invalid code' });
    }

    // Check if transaction is paid
    if (transaction.status !== 'paid') {
      return res.json({ 
        valid: false, 
        message: 'This code is not valid. Payment may be pending or failed.' 
      });
    }

    // Check if transaction has expired (if endDate exists)
    if (transaction.contractPeriod?.endDate) {
      if (isTransactionExpired(transaction.contractPeriod.endDate)) {
        return res.json({ 
          valid: false, 
          message: 'Purchase code has expired. You cannot play the game.',
          isExpired: true
        });
      }
    }

    // Calculate remaining seats
    const maxSeats = transaction.maxSeats || 5;
    const remainingSeats = maxSeats - (transaction.usedSeats || 0);
    const seatsFull = remainingSeats <= 0;
    
    // Check if seats are full - return valid: false with seatsFull flag
    if (seatsFull) {
      return res.json({ 
        valid: false, 
        message: `You have only ${maxSeats} seat${maxSeats > 1 ? 's' : ''}. Your seats are completed.`,
        seatsFull: true,
        remainingSeats: 0,
        maxSeats: maxSeats,
        usedSeats: transaction.usedSeats || 0,
        isExpired: false
      });
    }

    // Check if current user has already played (if userId is available from query or auth)
    // Note: This endpoint is public, so we can't check user here, but we'll check in use-code and start-game-play
    const userId = req.query.userId || req.userId; // Try to get from query or auth if available
    let hasUserPlayed = false;
    let isOwner = false;
    
    if (userId) {
      hasUserPlayed = transaction.gamePlays?.some(
        (play) => play.userId && play.userId.toString() === userId.toString()
      );
      
      // Check if this is an individual purchase and user owns it
      if (!transaction.organizationId && !transaction.schoolId) {
        const transactionUserId = transaction.userId?._id || transaction.userId;
        if (transactionUserId && transactionUserId.toString() === userId.toString()) {
          isOwner = true;
        }
      }
    }

    // Get package type (prefer packageType, fallback to type)
    const packageType = transaction.packageId?.packageType || transaction.packageId?.type || transaction.packageType || 'standard';
    
    res.json({
      valid: true,
      transaction: {
        id: transaction._id,
        packageName: transaction.packageId?.name || transaction.customPackageId?.name,
        packageType: packageType, // Include package type for frontend validation
        productId: transaction.productId?._id || transaction.productId?.id || transaction.productId || null, // Include productId
        remainingSeats: remainingSeats,
        maxSeats: transaction.maxSeats || 5,
        usedSeats: transaction.usedSeats || 0,
        codeApplications: transaction.codeApplications || 0,
        gamePlays: transaction.gamePlays?.length || 0,
        endDate: transaction.contractPeriod?.endDate,
        seatsAvailable: remainingSeats > 0,
        hasUserPlayed: hasUserPlayed, // Indicate if user has already played
        isOwner: isOwner, // Indicate if user owns this code (for individual purchases)
        userId: transaction.userId?._id || transaction.userId || null, // Include userId for ownership check
        organizationId: transaction.organizationId?._id || transaction.organizationId || null, // Include organizationId
        schoolId: transaction.schoolId?._id || transaction.schoolId || null // Include schoolId
      },
    });
  } catch (error) {
    console.error('Error checking purchase code:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Use purchase code (when someone uses the code to play)
router.post('/use-purchase-code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    if (!req.userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const transaction = await Transaction.findOne({
      uniqueCode: code,
    })
      .populate('packageId', 'name type packageType')
      .populate('customPackageId') // Populate custom package
      .populate('productId', 'name description') // Populate productId
      .populate('userId', 'name email')
      .populate('organizationId', 'name ownerId')
      .populate('schoolId', 'name ownerId');
    
    // If custom package exists and productId is not set, get it from custom package
    if (transaction?.customPackageId && !transaction.productId) {
      const CustomPackage = require('../models/CustomPackage');
      const customPackage = await CustomPackage.findById(transaction.customPackageId)
        .populate('productIds');
      
      if (customPackage?.productIds && Array.isArray(customPackage.productIds) && customPackage.productIds.length > 0) {
        transaction.productId = customPackage.productIds[0]._id || customPackage.productIds[0].id || customPackage.productIds[0];
        console.log(`✅ Extracted productId from custom package for use: ${transaction.productId}`);
      }
    }

    if (!transaction) {
      return res.status(404).json({ error: 'Invalid purchase code' });
    }

    // Check if transaction is paid
    if (transaction.status !== 'paid') {
      return res.status(400).json({ 
        error: 'This purchase code is not valid. Payment may be pending or failed.' 
      });
    }

    // Check if transaction has expired
    if (transaction.contractPeriod?.endDate) {
      if (isTransactionExpired(transaction.contractPeriod.endDate)) {
        return res.status(400).json({ error: 'This purchase code has expired' });
      }
    }

    // Check if this is an individual purchase (no organization/school)
    // Individual users can only use codes they purchased themselves, OR if they were referred by the code owner
    if (!transaction.organizationId && !transaction.schoolId) {
      const transactionUserId = transaction.userId?._id || transaction.userId;
      const currentUserId = req.userId.toString();
      
      // Check if user owns the code
      if (transactionUserId && transactionUserId.toString() !== currentUserId) {
        // User doesn't own the code - check if they were referred by the code owner
        const User = require('../models/User');
        const currentUser = await User.findById(req.userId).select('referredBy');
        
        if (currentUser && currentUser.referredBy) {
          const referrerId = currentUser.referredBy.toString();
          // Check if the code owner is the referrer
          if (transactionUserId.toString() === referrerId) {
            // User was referred by the code owner - allow them to use the code
            console.log(`✅ Referred user ${currentUserId} using referrer's code ${code}`);
          } else {
            // User was referred by someone else, not the code owner
            return res.status(403).json({ 
              error: 'This code belongs to another user. Only the user who purchased this code can use it to play the game.' 
            });
          }
        } else {
          // User is not referred by anyone - deny access
          return res.status(403).json({ 
            error: 'This code belongs to another user. Only the user who purchased this code can use it to play the game.' 
          });
        }
      }
    }

    // Check if user is a member of the organization/school (if code belongs to organization/school)
    if (transaction.organizationId || transaction.schoolId) {
      const User = require('../models/User');
      const Organization = require('../models/Organization');
      const School = require('../models/School');
      const currentUser = await User.findById(req.userId);
      
      if (!currentUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      let isMember = false;
      let isOwner = false;
      let memberType = '';

      // Check organization membership
      if (transaction.organizationId) {
        const txOrgId = transaction.organizationId?._id || transaction.organizationId;
        const organization = await Organization.findById(txOrgId);
        
        // Check if user is owner
        if (organization && organization.ownerId) {
          const orgOwnerId = organization.ownerId?._id || organization.ownerId;
          if (orgOwnerId.toString() === req.userId.toString()) {
            isOwner = true;
            isMember = true;
            memberType = 'organization';
          }
        }

        // Check if user is a member
        if (!isMember) {
          const userOrgId = currentUser.organizationId?._id || currentUser.organizationId;
          if (userOrgId && userOrgId.toString() === txOrgId.toString()) {
            isMember = true;
            memberType = 'organization';
          }
        }
      }

      // Check school membership
      if (!isMember && transaction.schoolId) {
        const txSchoolId = transaction.schoolId?._id || transaction.schoolId;
        const school = await School.findById(txSchoolId);
        
        // Check if user is owner
        if (school && school.ownerId) {
          const schoolOwnerId = school.ownerId?._id || school.ownerId;
          if (schoolOwnerId.toString() === req.userId.toString()) {
            isOwner = true;
            isMember = true;
            memberType = 'school';
          }
        }

        // Check if user is a member
        if (!isMember) {
          const userSchoolId = currentUser.schoolId?._id || currentUser.schoolId;
          if (userSchoolId && userSchoolId.toString() === txSchoolId.toString()) {
            isMember = true;
            memberType = 'school';
          }
        }
      }

      // If not a member or owner, return error
      if (!isMember) {
        // Determine exact type for error message
        let entityType = 'organization';
        if (transaction.schoolId) {
          entityType = 'institute';
        } else if (transaction.organizationId) {
          entityType = 'organization';
        }
        
        return res.status(403).json({ 
          error: `You are not a member of this ${entityType}. Only approved members can use this code to play the game.` 
        });
      }

      // Check if member status is approved (only for members, not owners)
      if (!isOwner && currentUser.memberStatus !== 'approved') {
        // Determine exact type for error message
        let entityType = 'organization';
        let adminType = 'organization admin';
        if (transaction.schoolId) {
          entityType = 'institute';
          adminType = 'institute admin';
        } else if (transaction.organizationId) {
          entityType = 'organization';
          adminType = 'organization admin';
        }
        
        return res.status(403).json({ 
          error: `Your membership is not approved yet. Please wait for approval from the ${adminType} before using this code.` 
        });
      }
    }

    // Check if seats are available
    const maxSeats = transaction.maxSeats || 5;
    const usedSeats = transaction.usedSeats || 0;

    // Check if this user has already played with this code
    const hasUserPlayed = transaction.gamePlays?.some(
      (play) => play.userId && play.userId.toString() === req.userId.toString()
    );

    // If user has played, check if they've completed all 3 levels
    if (hasUserPlayed) {
      // Check user's game progress to see if they've completed all 3 levels
      const GameProgress = require('../models/GameProgress');
      const userProgress = await GameProgress.find({ userId: req.userId });
      
      // Check if user has completed all 3 levels
      const level1Complete = userProgress.some(p => p.levelNumber === 1 && p.completedAt && p.cards && p.cards.length > 0);
      const level2Complete = userProgress.some(p => p.levelNumber === 2 && p.completedAt && p.cards && p.cards.length > 0);
      const level3Complete = userProgress.some(p => p.levelNumber === 3 && p.completedAt && p.cards && p.cards.length > 0);
      
      const allLevelsCompleted = level1Complete && level2Complete && level3Complete;
      
      // If user has completed all 3 levels, they've used their seat and can't play again
      if (allLevelsCompleted) {
        return res.status(400).json({ 
          error: 'You have already completed all levels with this code. Your seat has been used.',
          alreadyPlayed: true,
          seatsFinished: true
        });
      }
      
      // If user has played but not completed all levels, allow resume (seat not used yet)
      // This allows users to resume their game until they complete all 3 levels
    }

    // Track code application (for statistics)
    transaction.codeApplications = (transaction.codeApplications || 0) + 1;
    
    // Add referral entry for code verification (track who verified the code)
    const existingReferral = transaction.referrals?.find(
      (ref) => ref.referredUserId && ref.referredUserId.toString() === req.userId.toString()
    );
    
    if (!existingReferral) {
      if (!transaction.referrals) {
        transaction.referrals = [];
      }
      transaction.referrals.push({
        referredUserId: req.userId,
        usedAt: new Date(),
      });
    }

    await transaction.save();

    // Get package type (prefer packageType, fallback to type)
    const packageType = transaction.packageId?.packageType || transaction.packageId?.type || transaction.packageType || 'standard';

    res.json({
      message: 'Purchase code used successfully',
      transaction: {
        ...transaction.toObject(),
        packageType: packageType, // Include package type for frontend validation
        productId: transaction.productId?._id || transaction.productId?.id || transaction.productId || null, // Include productId
        remainingSeats: (transaction.maxSeats || 5) - (transaction.usedSeats || 0),
        maxSeats: transaction.maxSeats || 5,
        usedSeats: transaction.usedSeats || 0,
        codeApplications: transaction.codeApplications || 0,
        gamePlays: transaction.gamePlays?.length || 0,
        endDate: transaction.contractPeriod?.endDate,
        expiresAt: transaction.contractPeriod?.endDate,
      },
    });
  } catch (error) {
    console.error('Error using purchase code:', error);
    res.status(500).json({ 
      error: 'Server error: ' + error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Start game play for purchase - increment seat count when user actually starts playing
router.post('/start-purchase-game-play', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    if (!req.userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const transaction = await Transaction.findOne({
      uniqueCode: code,
    })
      .populate('packageId', 'name type packageType')
      .populate('customPackageId') // Populate custom package
      .populate('productId', 'name description'); // Populate productId
    
    // If custom package exists and productId is not set, get it from custom package
    if (transaction?.customPackageId && !transaction.productId) {
      const CustomPackage = require('../models/CustomPackage');
      const customPackage = await CustomPackage.findById(transaction.customPackageId)
        .populate('productIds');
      
      if (customPackage?.productIds && Array.isArray(customPackage.productIds) && customPackage.productIds.length > 0) {
        transaction.productId = customPackage.productIds[0]._id || customPackage.productIds[0].id || customPackage.productIds[0];
        console.log(`✅ Extracted productId from custom package for start-game-play: ${transaction.productId}`);
      }
    }

    if (!transaction) {
      return res.status(404).json({ error: 'Invalid purchase code' });
    }

    // Check if transaction is paid
    if (transaction.status !== 'paid') {
      return res.status(400).json({ error: 'This purchase code is not valid' });
    }

    // Check package type - only allow digital and digital_physical packages
    const packageType = transaction.packageId?.packageType || transaction.packageId?.type || transaction.packageType || 'standard';
    if (packageType === 'physical') {
      return res.status(400).json({ 
        error: 'This package type is physical. You have purchased physical cards, so online game play is not allowed. Please use your physical cards to play.',
        packageType: 'physical'
      });
    }

    // Check if transaction has expired
    if (transaction.contractPeriod?.endDate) {
      if (isTransactionExpired(transaction.contractPeriod.endDate)) {
        return res.status(400).json({ error: 'This purchase code has expired' });
      }
    }

    // Check if seats are available BEFORE starting game
    const maxSeats = transaction.maxSeats || 5;
    const usedSeats = transaction.usedSeats || 0;
    if (usedSeats >= maxSeats) {
      return res.status(400).json({ 
        error: `You have only ${maxSeats} seat${maxSeats > 1 ? 's' : ''}. Your seats are completed.`,
        seatsFull: true,
        maxSeats: maxSeats,
        usedSeats: usedSeats
      });
    }

    // Check if this user has already played with this code
    const hasUserPlayed = transaction.gamePlays?.some(
      (play) => play.userId && play.userId.toString() === req.userId.toString()
    );

    // If user has played, check if they've completed all 3 levels
    if (hasUserPlayed) {
      // Check user's game progress to see if they've completed all 3 levels
      const GameProgress = require('../models/GameProgress');
      const userProgress = await GameProgress.find({ userId: req.userId });
      
      // Check if user has completed all 3 levels
      const level1Complete = userProgress.some(p => p.levelNumber === 1 && p.completedAt && p.cards && p.cards.length > 0);
      const level2Complete = userProgress.some(p => p.levelNumber === 2 && p.completedAt && p.cards && p.cards.length > 0);
      const level3Complete = userProgress.some(p => p.levelNumber === 3 && p.completedAt && p.cards && p.cards.length > 0);
      
      const allLevelsCompleted = level1Complete && level2Complete && level3Complete;
      
      // If user has completed all 3 levels, they've used their seat and can't play again
      if (allLevelsCompleted) {
        return res.status(400).json({ 
          error: 'You have already completed all levels with this code. Your seat has been used.',
          alreadyPlayed: true,
          seatsFinished: true
        });
      }
      
      // If user has played but not completed all levels, allow resume (seat not used yet)
      // This allows users to resume their game until they complete all 3 levels
    }

    // CRITICAL: Check if cards are available before incrementing seats
    // Only increment seats if cards are actually available for the product/package
    const Product = require('../models/Product');
    const Package = require('../models/Package');
    const Card = require('../models/Card');
    let cardsAvailable = false;

    if (transaction.productId) {
      // Check if product has cards in any level
      const product = await Product.findById(transaction.productId).select('level1 level2 level3');
      if (product) {
        const hasLevel1Cards = product.level1 && product.level1.length > 0;
        const hasLevel2Cards = product.level2 && product.level2.length > 0;
        const hasLevel3Cards = product.level3 && product.level3.length > 0;
        cardsAvailable = hasLevel1Cards || hasLevel2Cards || hasLevel3Cards;
      }
    } else if (transaction.packageId) {
      // Check if package has cards with questions
      const packageDoc = await Package.findById(transaction.packageId).select('includedCardIds');
      if (packageDoc && packageDoc.includedCardIds && packageDoc.includedCardIds.length > 0) {
        // Check if package has cards with questions
        const cardsWithQuestions = await Card.find({ 
          _id: { $in: packageDoc.includedCardIds },
          'question.description': { $exists: true, $ne: '' }
        });
        cardsAvailable = cardsWithQuestions && cardsWithQuestions.length > 0;
      }
    }

    // If no cards are available, don't increment seats and return error
    if (!cardsAvailable) {
      return res.status(400).json({ 
        error: 'No cards are available for this product/package. Please contact support to add cards before playing the game.',
        noCardsAvailable: true
      });
    }

    // Don't increment seats here - seats will be incremented when user completes all 3 levels
    // Just track that user started playing (for checking if they already played)
    if (!transaction.gamePlays) {
      transaction.gamePlays = [];
    }
    // Only add to gamePlays if user is not already in the list
    const userAlreadyInGamePlays = transaction.gamePlays.some(
      (play) => play.userId && play.userId.toString() === req.userId.toString()
    );
    if (!userAlreadyInGamePlays) {
      transaction.gamePlays.push({
        userId: req.userId,
        playedAt: new Date(),
      });
      await transaction.save();
    }

    // Update organization/school seatUsage if transaction belongs to one
    if (transaction.organizationId) {
      try {
        const Organization = require('../models/Organization');
        const organization = await Organization.findById(transaction.organizationId);
        if (organization) {
          // Calculate total used seats from all transactions and free trials for this organization
          const orgTransactions = await Transaction.find({ 
            organizationId: transaction.organizationId,
            status: 'paid'
          });
          const orgFreeTrials = await FreeTrial.find({ 
            organizationId: transaction.organizationId
          });
          
          const transactionUsedSeats = orgTransactions.reduce((sum, tx) => sum + (tx.usedSeats || 0), 0);
          const freeTrialUsedSeats = orgFreeTrials.reduce((sum, ft) => sum + (ft.usedSeats || 0), 0);
          const totalUsedSeats = transactionUsedSeats + freeTrialUsedSeats;
          
          if (!organization.seatUsage) {
            organization.seatUsage = { seatLimit: 0, usedSeats: 0, status: 'prospect' };
          }
          organization.seatUsage.usedSeats = totalUsedSeats;
          await organization.save();
        }
      } catch (err) {
        console.error('Error updating organization seatUsage:', err);
      }
    }

    if (transaction.schoolId) {
      try {
        const School = require('../models/School');
        const school = await School.findById(transaction.schoolId);
        if (school) {
          // Calculate total used seats from all transactions for this school
          // Note: Free trials don't have schoolId, only organizationId
          const schoolTransactions = await Transaction.find({ 
            schoolId: transaction.schoolId,
            status: 'paid'
          });
          const totalUsedSeats = schoolTransactions.reduce((sum, tx) => sum + (tx.usedSeats || 0), 0);
          
          if (!school.seatUsage) {
            school.seatUsage = { seatLimit: 0, usedSeats: 0, status: 'prospect' };
          }
          school.seatUsage.usedSeats = totalUsedSeats;
          await school.save();
        }
      } catch (err) {
        console.error('Error updating school seatUsage:', err);
      }
    }

    res.json({
      message: 'Game play started successfully',
      transaction: {
        ...transaction.toObject(),
        productId: transaction.productId?._id || transaction.productId?.id || transaction.productId || null, // Include productId
        remainingSeats: maxSeats - transaction.usedSeats,
        maxSeats: maxSeats,
        usedSeats: transaction.usedSeats,
        codeApplications: transaction.codeApplications || 0,
        gamePlays: transaction.gamePlays?.length || 0,
        endDate: transaction.contractPeriod?.endDate,
      },
    });
  } catch (error) {
    console.error('Error starting purchase game play:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get referrer's unique code for referred user
router.get('/referrer-code', authenticateToken, async (req, res) => {
  try {
    const User = require('../models/User');
    const Transaction = require('../models/Transaction');
    
    const user = await User.findById(req.userId).select('referredBy');
    if (!user || !user.referredBy) {
      return res.status(404).json({ error: 'No referrer found for this user' });
    }

    // Find referrer's active transaction with available seats
    const referrerTransaction = await Transaction.findOne({
      userId: user.referredBy,
      status: 'paid',
      $or: [
        { 'contractPeriod.endDate': { $exists: false } },
        { 'contractPeriod.endDate': { $gt: new Date() } }
      ]
    })
      .sort({ createdAt: -1 }) // Get most recent transaction
      .select('uniqueCode maxSeats usedSeats');

    if (!referrerTransaction) {
      return res.status(404).json({ error: 'No active transaction found for referrer' });
    }

    // Check if seats are available
    const remainingSeats = (referrerTransaction.maxSeats || 5) - (referrerTransaction.usedSeats || 0);
    if (remainingSeats <= 0) {
      return res.status(400).json({ error: 'Referrer has no available seats' });
    }

    res.json({
      uniqueCode: referrerTransaction.uniqueCode,
      referrerId: user.referredBy.toString()
    });
  } catch (error) {
    console.error('Error getting referrer code:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin endpoint to fix existing transactions - add them to school/organization transactionIds
router.post('/fix-transactions', authenticateToken, async (req, res) => {
  try {
    const User = require('../models/User');
    const Organization = require('../models/Organization');
    const School = require('../models/School');
    
    // Get all transactions
    const transactions = await Transaction.find({}).populate('userId', 'schoolId organizationId');
    
    let fixed = 0;
    let errors = [];
    
    for (const transaction of transactions) {
      try {
        const user = transaction.userId;
        if (!user) continue;
        
        const transactionIdStr = transaction._id.toString();
        
        // Check if user is owner of any organization
        try {
          const orgAsOwner = await Organization.findOne({ ownerId: user._id });
          if (orgAsOwner) {
            if (!orgAsOwner.transactionIds) {
              orgAsOwner.transactionIds = [];
            }
            const existingIds = orgAsOwner.transactionIds.map(id => id.toString());
            if (!existingIds.includes(transactionIdStr)) {
              orgAsOwner.transactionIds.push(transaction._id);
              await orgAsOwner.save();
              fixed++;
              console.log(`✅ Fixed: Transaction ${transactionIdStr} added to organization (owner) ${orgAsOwner._id}`);
            }
            
            // Also update transaction with organizationId
            if (!transaction.organizationId) {
              transaction.organizationId = orgAsOwner._id;
            }
          }
        } catch (e) {
          console.error('Error checking organization owner:', e);
        }
        
        // Check if user is owner of any school
        try {
          const schoolAsOwner = await School.findOne({ ownerId: user._id });
          if (schoolAsOwner) {
            if (!schoolAsOwner.transactionIds) {
              schoolAsOwner.transactionIds = [];
            }
            const existingIds = schoolAsOwner.transactionIds.map(id => id.toString());
            if (!existingIds.includes(transactionIdStr)) {
              schoolAsOwner.transactionIds.push(transaction._id);
              await schoolAsOwner.save();
              fixed++;
              console.log(`✅ Fixed: Transaction ${transactionIdStr} added to school (owner) ${schoolAsOwner._id}`);
            }
            
            // Also update transaction with schoolId
            if (!transaction.schoolId) {
              transaction.schoolId = schoolAsOwner._id;
            }
          }
        } catch (e) {
          console.error('Error checking school owner:', e);
        }
        
        // Add to organization's transactionIds (as member)
        if (user.organizationId) {
          const organization = await Organization.findById(user.organizationId);
          if (organization) {
            if (!organization.transactionIds) {
              organization.transactionIds = [];
            }
            const existingIds = organization.transactionIds.map(id => id.toString());
            if (!existingIds.includes(transactionIdStr)) {
              organization.transactionIds.push(transaction._id);
              await organization.save();
              fixed++;
              console.log(`✅ Fixed: Transaction ${transactionIdStr} added to organization (member) ${organization._id}`);
            }
            
            // Also update transaction with organizationId
            if (!transaction.organizationId) {
              transaction.organizationId = user.organizationId;
            }
          }
        }
        
        // Add to school's transactionIds (as member)
        if (user.schoolId) {
          const school = await School.findById(user.schoolId);
          if (school) {
            if (!school.transactionIds) {
              school.transactionIds = [];
            }
            const existingIds = school.transactionIds.map(id => id.toString());
            if (!existingIds.includes(transactionIdStr)) {
              school.transactionIds.push(transaction._id);
              await school.save();
              fixed++;
              console.log(`✅ Fixed: Transaction ${transactionIdStr} added to school (member) ${school._id}`);
            }
            
            // Also update transaction with schoolId
            if (!transaction.schoolId) {
              transaction.schoolId = user.schoolId;
            }
          }
        }
        
        // Save transaction if we updated it
        if (transaction.isModified()) {
          await transaction.save();
        }
      } catch (err) {
        errors.push({ transactionId: transaction._id, error: err.message });
        console.error('Error fixing transaction:', err);
      }
    }
    
    res.json({
      message: `Fixed ${fixed} transactions`,
      total: transactions.length,
      fixed,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error fixing transactions:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

