const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const Package = require('../models/Package');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

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

// Create Stripe Checkout Session
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(500).json({ error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables.' });
    }

    const { packageId, productId } = req.body;
    
    if (!packageId) {
      return res.status(400).json({ error: 'Package ID is required' });
    }

    const package = await Package.findById(packageId);
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

    // Check if there's already a successful transaction for this user and package
    const existingTransaction = await Transaction.findOne({
      userId: req.userId,
      packageId: package._id,
      status: 'paid',
    });

    if (existingTransaction) {
      return res.status(400).json({ error: 'You have already purchased this package' });
    }

    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables.' });
    }

    // Generate unique code for this payment (will be used when transaction is created in webhook)
    let uniqueCode = generateUniqueCode();
    let codeExists = await Transaction.findOne({ uniqueCode });
    while (codeExists) {
      uniqueCode = generateUniqueCode();
      codeExists = await Transaction.findOne({ uniqueCode });
    }

    // Get frontend URL from environment or use default
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Prepare line items based on billing type
    const isSubscription = package.pricing.billingType === 'subscription';
    const lineItems = [
      {
        price_data: {
          currency: package.pricing.currency?.toLowerCase() || 'eur',
          product_data: {
            name: package.name,
            description: package.description || '',
          },
          unit_amount: Math.round(package.pricing.amount * 100), // Convert to cents
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

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: isSubscription ? 'subscription' : 'payment',
      success_url: `${frontendUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}&uniqueCode=${uniqueCode}`,
      cancel_url: `${frontendUrl}/packages?canceled=true`,
      metadata: {
        userId: req.userId.toString(),
        packageId: package._id.toString(),
        productId: productId ? productId.toString() : '',
        packageName: package.name,
        uniqueCode: uniqueCode,
        billingType: package.pricing.billingType || 'one_time',
      },
      customer_email: user.email,
    });

    res.json({
      sessionId: session.id,
      url: session.url,
      uniqueCode: uniqueCode,
    });
  } catch (error) {
    console.error('Error creating checkout session:', {
      error: error.message,
      stack: error.stack,
      packageId: packageId,
      packageName: package?.name,
      billingType: package?.pricing?.billingType,
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
  if (!isStripeConfigured()) {
    console.warn('⚠️ Stripe is not configured. Webhook ignored.');
    return res.status(200).json({ received: true, message: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

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
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Handle Stripe Checkout Session completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      // Check if transaction already exists for this checkout session (prevent duplicates)
      let transaction = await Transaction.findOne({
        stripePaymentIntentId: session.payment_intent || session.id,
      });

      // Only create transaction if it doesn't exist (prevent duplicates)
      if (!transaction) {
        const userId = session.metadata.userId;
        const packageId = session.metadata.packageId;
        const productId = session.metadata.productId || null;
        const uniqueCode = session.metadata.uniqueCode;
        const billingType = session.metadata.billingType || 'one_time';

        // Verify user and package exist
        const user = await User.findById(userId);
        const package = await Package.findById(packageId);
        
        // Fetch product if productId is provided
        let product = null;
        if (productId) {
          const Product = require('../models/Product');
          product = await Product.findById(productId);
        }

        if (!user || !package) {
          console.error('User or Package not found for checkout session:', session.id);
          return res.json({ received: true, error: 'User or Package not found' });
        }

        // Check if user already has this package (prevent duplicate memberships)
        const existingMembership = user.memberships.find(
          (m) => m.packageId.toString() === packageId && m.status === 'active'
        );

        if (existingMembership) {
          console.warn('User already has active membership for this package:', packageId);
          return res.json({ received: true, warning: 'User already has membership' });
        }

        // Get payment amount from session
        const amount = session.amount_total ? session.amount_total / 100 : session.amount_subtotal / 100;
        const currency = session.currency?.toUpperCase() || 'EUR';

        // Determine transaction type based on package targetAudiences or product targetAudience
        const transactionType = getTransactionType(package, product);
        console.log('🔍 Transaction Type Determination:', {
          productId: productId,
          productTargetAudience: product?.targetAudience,
          packageTargetAudiences: package?.targetAudiences,
          determinedType: transactionType
        });

        // Get package type (prefer packageType, fallback to type)
        const packageType = package.packageType || package.type || 'standard';

        // Create transaction ONLY when payment succeeds
        transaction = await Transaction.create({
          type: transactionType,
          userId: userId,
          packageId: packageId,
          packageType: packageType,
          productId: productId || null,
          amount: amount,
          currency: currency,
          status: 'paid',
          paymentProvider: 'stripe',
          stripePaymentIntentId: session.payment_intent || session.id,
          uniqueCode: uniqueCode,
          maxSeats: package.maxSeats || 5, // Get from package, default to 5 if not set
          usedSeats: 0,
          codeApplications: 0,
          gamePlays: [],
          referrals: [],
          contractPeriod: {
            startDate: new Date(),
            endDate: package.expiryDate
              ? new Date(package.expiryDate)
              : (billingType === 'subscription'
                ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                : null),
          },
        });

        // Determine membership type based on package targetAudiences or product targetAudience
        const membershipType = getMembershipType(package, product);
        console.log('🔍 Membership Type Determination:', {
          productId: productId,
          productTargetAudience: product?.targetAudience,
          packageTargetAudiences: package?.targetAudiences,
          determinedMembershipType: membershipType
        });

        // Determine membership end date - use package expiryDate if available, otherwise use contractPeriod.endDate
        let membershipEndDate = transaction.contractPeriod.endDate;
        if (package.expiryDate) {
          // If package has expiryDate, use it
          membershipEndDate = new Date(package.expiryDate);
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

        console.log('Transaction created and membership added for checkout session:', session.id);
      } else {
        console.log('Transaction already exists for checkout session:', session.id);
      }
    } else if (event.type === 'payment_intent.succeeded') {
      // Also handle payment_intent.succeeded for backward compatibility
      const paymentIntent = event.data.object;
      
      // Check if transaction already exists
      let transaction = await Transaction.findOne({
        stripePaymentIntentId: paymentIntent.id,
      });

      if (!transaction && paymentIntent.metadata.userId) {
        const userId = paymentIntent.metadata.userId;
        const packageId = paymentIntent.metadata.packageId;
        const productId = paymentIntent.metadata.productId || null;
        const uniqueCode = paymentIntent.metadata.uniqueCode;
        const billingType = paymentIntent.metadata.billingType || 'one_time';

        const user = await User.findById(userId);
        const package = await Package.findById(packageId);
        
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

          transaction = await Transaction.create({
            type: transactionType,
            userId: userId,
            packageId: packageId,
            packageType: packageType,
            productId: productId || null,
            amount: paymentIntent.amount / 100,
            currency: paymentIntent.currency.toUpperCase(),
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
              endDate: package.expiryDate
                ? new Date(package.expiryDate)
                : (billingType === 'subscription'
                  ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                  : null),
            },
          });

          // Determine membership type based on package targetAudiences or product targetAudience
          const membershipType = getMembershipType(package, product);

          // Determine membership end date - use package expiryDate if available, otherwise use contractPeriod.endDate
          let membershipEndDate = transaction.contractPeriod.endDate;
          if (package.expiryDate) {
            // If package has expiryDate, use it
            membershipEndDate = new Date(package.expiryDate);
          }

          user.memberships.push({
            packageId: packageId,
            membershipType: membershipType,
            status: 'active',
            startDate: transaction.contractPeriod.startDate,
            endDate: membershipEndDate,
          });
          await user.save();
        }
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
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

    // If transaction doesn't exist but payment is complete, create it (fallback for when webhook hasn't fired)
    if (!transaction && session.payment_status === 'paid') {
      const userId = session.metadata.userId;
      const packageId = session.metadata.packageId;
      const uniqueCode = session.metadata.uniqueCode;
      const billingType = session.metadata.billingType || 'one_time';

      // Verify user and package exist
      const user = await User.findById(userId);
      const package = await Package.findById(packageId);
      
      // Fetch product if productId is provided
      const productId = session.metadata.productId || null;
      let product = null;
      if (productId) {
        const Product = require('../models/Product');
        product = await Product.findById(productId);
      }

      if (user && package) {
        // Check if user already has this package
        const existingMembership = user.memberships.find(
          (m) => m.packageId.toString() === packageId && m.status === 'active'
        );

        if (!existingMembership) {
          // Get payment amount from session
          const amount = session.amount_total ? session.amount_total / 100 : session.amount_subtotal / 100;
          const currency = session.currency?.toUpperCase() || 'EUR';

          // Determine transaction type based on package targetAudiences or product targetAudience
          const transactionType = getTransactionType(package, product);

          // Get package type (prefer packageType, fallback to type)
          const packageType = package.packageType || package.type || 'standard';

          // Get productId from metadata if available
          const productId = session.metadata.productId || null;

          // Create transaction
          transaction = await Transaction.create({
            type: transactionType,
            userId: userId,
            packageId: packageId,
            packageType: packageType,
            productId: productId || null,
            amount: amount,
            currency: currency,
            status: 'paid',
            paymentProvider: 'stripe',
            stripePaymentIntentId: session.payment_intent || session.id,
            uniqueCode: uniqueCode,
            maxSeats: package.maxSeats || 5, // Dynamic maxSeats from package
            usedSeats: 0,
            codeApplications: 0,
            gamePlays: [],
            referrals: [],
            contractPeriod: {
              startDate: new Date(),
              endDate: package.expiryDate
                ? new Date(package.expiryDate)
                : (billingType === 'subscription'
                  ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                  : null),
            },
          });

          // Determine membership type based on package targetAudiences or product targetAudience
          const membershipType = getMembershipType(package, product);
          console.log('🔍 Membership Type Determination (fallback):', {
            productId: productId,
            productTargetAudience: product?.targetAudience,
            packageTargetAudiences: package?.targetAudiences,
            determinedMembershipType: membershipType
          });

          // Determine membership end date - use package expiryDate if available, otherwise use contractPeriod.endDate
          let membershipEndDate = transaction.contractPeriod.endDate;
          if (package.expiryDate) {
            // If package has expiryDate, use it
            membershipEndDate = new Date(package.expiryDate);
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

          console.log('Transaction created via fallback for session:', session.id);
          
          // Populate transaction for response
          transaction = await Transaction.findById(transaction._id)
            .populate('packageId', 'name')
            .populate('userId', 'name email');
        }
      }
    }

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
      .populate('userId', 'name email');

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
    let isExpired = false;
    if (transaction.contractPeriod?.endDate) {
      const now = new Date();
      const endDate = new Date(transaction.contractPeriod.endDate);
      isExpired = now > endDate;
      
      if (isExpired) {
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
    if (userId) {
      hasUserPlayed = transaction.gamePlays?.some(
        (play) => play.userId && play.userId.toString() === userId.toString()
      );
    }

    // Get package type (prefer packageType, fallback to type)
    const packageType = transaction.packageId?.packageType || transaction.packageId?.type || transaction.packageType || 'standard';
    
    res.json({
      valid: true,
      transaction: {
        id: transaction._id,
        packageName: transaction.packageId?.name,
        packageType: packageType, // Include package type for frontend validation
        remainingSeats: remainingSeats,
        maxSeats: transaction.maxSeats || 5,
        usedSeats: transaction.usedSeats || 0,
        codeApplications: transaction.codeApplications || 0,
        gamePlays: transaction.gamePlays?.length || 0,
        endDate: transaction.contractPeriod?.endDate,
        seatsAvailable: remainingSeats > 0,
        hasUserPlayed: hasUserPlayed // Indicate if user has already played
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
      .populate('userId', 'name email');

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
      if (new Date() > new Date(transaction.contractPeriod.endDate)) {
        return res.status(400).json({ error: 'This purchase code has expired' });
      }
    }

    // Check if this user has already played with this code
    const hasUserPlayed = transaction.gamePlays?.some(
      (play) => play.userId && play.userId.toString() === req.userId.toString()
    );

    if (hasUserPlayed) {
      return res.status(400).json({ 
        error: 'You have already played the game with this code. Your seats are finished. You cannot play the game with any other seat.',
        alreadyPlayed: true,
        seatsFinished: true
      });
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
      .populate('packageId', 'name type packageType');

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
      if (new Date() > new Date(transaction.contractPeriod.endDate)) {
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

    if (hasUserPlayed) {
      return res.status(400).json({ 
        error: 'You have already played the game with this code. Your seats are finished. You cannot play the game with any other seat.',
        alreadyPlayed: true,
        seatsFinished: true
      });
    }

    // Increment seat count when user actually starts playing
    transaction.usedSeats = (transaction.usedSeats || 0) + 1;
    
    // Track game play
    if (!transaction.gamePlays) {
      transaction.gamePlays = [];
    }
    transaction.gamePlays.push({
      userId: req.userId,
      playedAt: new Date(),
    });

    await transaction.save();

    res.json({
      message: 'Game play started successfully',
      transaction: {
        ...transaction.toObject(),
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

module.exports = router;

