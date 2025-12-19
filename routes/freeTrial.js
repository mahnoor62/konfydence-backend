const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const FreeTrial = require('../models/FreeTrial');
const User = require('../models/User');
const Package = require('../models/Package');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');

const router = express.Router();

// Generate unique code in format: 4573-DTE2-R232
const generateUniqueCode = () => {
  const getRandomDigits = (length) => {
    return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
  };
  
  const getRandomLetters = (length) => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return Array.from({ length }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  };
  
  const part1 = getRandomDigits(4);
  const part2 = getRandomLetters(3) + getRandomDigits(1);
  const part3 = getRandomLetters(1) + getRandomDigits(3);
  
  return `${part1}-${part2}-${part3}`;
};

// Create free trial
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { packageId, productId } = req.body;
    
    if (!packageId) {
      return res.status(400).json({ error: 'Package ID is required' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check product's target audience if productId is provided
    // B2B = businesses, B2E = schools
    let isEligibleForTrial = false;
    
    if (productId) {
      const product = await Product.findById(productId);
      if (product && product.targetAudience) {
        // If product is for businesses (B2B) or schools (B2E), allow free trial
        if (product.targetAudience === 'businesses' || product.targetAudience === 'schools') {
          isEligibleForTrial = true;
        }
      }
    }
    
    // If not eligible based on product, check user's purchase history (backward compatibility)
    if (!isEligibleForTrial) {
      // Check transactions with b2b_contract or b2e_contract type
      const b2bB2eTransactions = await Transaction.find({
        userId: req.userId,
        status: 'paid',
        $or: [
          { type: 'b2b_contract' },
          { type: 'b2e_contract' }
        ]
      }).populate('packageId', 'targetAudiences');

      // Also check if user has purchased packages with B2B or B2E target audiences
      const allPaidTransactions = await Transaction.find({
        userId: req.userId,
        status: 'paid',
        packageId: { $exists: true, $ne: null }
      }).populate('packageId', 'targetAudiences');

      // Check if any transaction has a package with B2B or B2E target audience
      const hasB2bB2ePackage = allPaidTransactions.some(transaction => {
        if (!transaction.packageId || !transaction.packageId.targetAudiences) {
          return false;
        }
        return transaction.packageId.targetAudiences.includes('B2B') || 
               transaction.packageId.targetAudiences.includes('B2E');
      });

      // User must have either b2b_contract/b2e_contract transaction OR purchased a B2B/B2E package
      if (b2bB2eTransactions.length > 0 || hasB2bB2ePackage) {
        isEligibleForTrial = true;
      }
    }

    // If still not eligible, return error
    if (!isEligibleForTrial) {
      return res.status(403).json({ 
        error: 'Free trial is only available for users who have purchased B2B or B2E packages' 
      });
    }

    // Check if user already has an active free trial
    const existingTrial = await FreeTrial.findOne({
      userId: req.userId,
      status: 'active',
      endDate: { $gt: new Date() },
    });

    if (existingTrial) {
      return res.status(400).json({ 
        error: 'You already have an active free trial',
        trial: existingTrial,
      });
    }

    // Generate unique code
    let uniqueCode = generateUniqueCode();
    let codeExists = await FreeTrial.findOne({ uniqueCode });
    while (codeExists) {
      uniqueCode = generateUniqueCode();
      codeExists = await FreeTrial.findOne({ uniqueCode });
    }

    // Free trial users always get 2 seats (fixed, not from package)
    const maxSeats = 2;

    // Create free trial (7 days from now)
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);

    const freeTrial = await FreeTrial.create({
      userId: req.userId,
      organizationId: user.organizationId,
      packageId: packageId,
      productId: productId ? productId : null,
      uniqueCode: uniqueCode,
      startDate: new Date(),
      endDate: endDate,
      maxSeats: maxSeats, // Fixed 2 seats for free trial users
      usedSeats: 0,
      status: 'active',
    });

    res.status(201).json({
      message: 'Free trial created successfully',
      trial: freeTrial,
    });
  } catch (error) {
    console.error('Error creating free trial:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check if user has ever used a free trial
router.get('/has-used-trial', authenticateToken, async (req, res) => {
  try {
    const hasUsedTrial = await FreeTrial.exists({
      userId: req.userId,
    });

    res.json({ hasUsedTrial: !!hasUsedTrial });
  } catch (error) {
    console.error('Error checking free trial usage:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's free trial
router.get('/my-trial', authenticateToken, async (req, res) => {
  try {
    const freeTrial = await FreeTrial.findOne({
      userId: req.userId,
      status: 'active',
      endDate: { $gt: new Date() },
    })
      .populate('packageId', 'name description')
      .populate('organizationId', 'name');

    if (!freeTrial) {
      return res.status(404).json({ error: 'No active free trial found' });
    }

    res.json(freeTrial);
  } catch (error) {
    console.error('Error fetching free trial:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Use referral code (when someone uses the code to play)
router.post('/use-code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    
    console.log('Use code request:', { code, userId: req.userId });
    
    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    if (!req.userId) {
      console.error('No userId found in request');
      return res.status(401).json({ error: 'User authentication required' });
    }

    const freeTrial = await FreeTrial.findOne({
      uniqueCode: code,
    })
      .populate('packageId', 'name');

    if (!freeTrial) {
      console.log('Free trial not found for code:', code);
      return res.status(404).json({ error: 'Invalid trial code' });
    }
    
    console.log('Free trial found:', {
      id: freeTrial._id,
      status: freeTrial.status,
      usedSeats: freeTrial.usedSeats,
      maxSeats: freeTrial.maxSeats,
      endDate: freeTrial.endDate,
      isExpired: new Date() > new Date(freeTrial.endDate),
    });

    // Check if trial is expired
    if (new Date() > new Date(freeTrial.endDate)) {
      freeTrial.status = 'expired';
      await freeTrial.save();
      return res.status(400).json({ error: 'This trial code has expired' });
    }

    // Check if trial is still active
    if (freeTrial.status !== 'active') {
      return res.status(400).json({ error: 'This trial code is no longer active' });
    }

    // Check if this user has already played with this code
    const hasUserPlayed = freeTrial.gamePlays?.some(
      (play) => play.userId && play.userId.toString() === req.userId.toString()
    );

    if (hasUserPlayed) {
      return res.status(400).json({ 
        error: 'You have already played the game with this code. Your seats are finished. You cannot play the game with any other seat.',
        alreadyPlayed: true,
        seatsFinished: true
      });
    }

    // Code verification - just track code application, don't increment seat count
    // Seat count will be incremented only when user actually starts playing game
    
    // Track code application (for statistics)
    freeTrial.codeApplications = (freeTrial.codeApplications || 0) + 1;
    
    // Add referral entry for code verification (track who verified the code)
    const existingReferral = freeTrial.referrals.find(
      (ref) => ref.referredUserId && ref.referredUserId.toString() === req.userId.toString()
    );
    
    if (!existingReferral) {
      freeTrial.referrals.push({
        referredUserId: req.userId,
        usedAt: new Date(),
      });
    }

    await freeTrial.save();

    res.json({
      message: 'Trial code used successfully',
      trial: {
        ...freeTrial.toObject(),
        remainingSeats: freeTrial.maxSeats - freeTrial.usedSeats,
        maxSeats: freeTrial.maxSeats,
        usedSeats: freeTrial.usedSeats,
        codeApplications: freeTrial.codeApplications || 0,
        gamePlays: freeTrial.gamePlays?.length || 0,
        endDate: freeTrial.endDate,
        expiresAt: freeTrial.endDate,
      },
    });
  } catch (error) {
    console.error('Error using trial code:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      name: error.name,
      userId: req.userId,
      codeFromRequest: req.body?.code
    });
    
    // Return more specific error messages
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: 'Validation error: ' + error.message });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid data format' });
    }
    
    res.status(500).json({ 
      error: 'Server error: ' + error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get all free trials for admin
router.get('/all', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin - adminId will be set for admin tokens
    const adminId = req.adminId || req.userId;
    
    if (adminId) {
      // Check if it's an admin by checking Admin model
      const Admin = require('../models/Admin');
      const admin = await Admin.findById(adminId);
      
      // If admin exists, allow access
      if (admin) {
        const trials = await FreeTrial.find()
          .populate('userId', 'name email accountType')
          .populate('packageId', 'name')
          .populate('organizationId', 'name segment')
          .sort({ createdAt: -1 });

        return res.json(trials);
      }
    }
    
    // Fallback: Check if regular user is admin (for backward compatibility)
    const user = await User.findById(req.userId);
    if (user && user.role === 'admin') {
      const trials = await FreeTrial.find()
        .populate('userId', 'name email accountType')
        .populate('packageId', 'name')
        .populate('organizationId', 'name segment')
        .sort({ createdAt: -1 });

      return res.json(trials);
    }

    return res.status(403).json({ error: 'Access denied' });
  } catch (error) {
    console.error('Error fetching all trials:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check if code is valid (public endpoint, no auth required)
router.get('/check-code/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const freeTrial = await FreeTrial.findOne({
      uniqueCode: code,
    })
      .populate('packageId', 'name');

    if (!freeTrial) {
      return res.json({ valid: false, message: 'Invalid code' });
    }

    // Check if trial is expired
    const now = new Date();
    const endDate = new Date(freeTrial.endDate);
    const isExpired = now > endDate;
    
    if (isExpired) {
      // Update status to expired
      if (freeTrial.status === 'active') {
        freeTrial.status = 'expired';
        await freeTrial.save();
      }
      return res.json({ 
        valid: false, 
        message: 'Free trial has expired. You cannot play the game.',
        isExpired: true
      });
    }

    // Check if trial is still active
    if (freeTrial.status !== 'active' && freeTrial.status !== 'completed') {
      return res.json({ valid: false, message: 'This trial code is no longer active' });
    }

    // Check if seats are available
    const maxSeats = freeTrial.maxSeats || 2;
    const remainingSeats = maxSeats - freeTrial.usedSeats;
    const seatsFull = freeTrial.usedSeats >= maxSeats;
    
    if (seatsFull) {
      return res.json({ 
        valid: false, 
        message: `You have only ${maxSeats} seat${maxSeats > 1 ? 's' : ''}. Your seats are completed.`,
        seatsFull: true,
        remainingSeats: 0,
        maxSeats: maxSeats,
        usedSeats: freeTrial.usedSeats,
        isExpired: false
      });
    }

    // Check if current user has already played (if userId is available from query or auth)
    // Note: This endpoint is public, so we can't check user here, but we'll check in use-code and start-game-play
    const userId = req.query.userId || req.userId; // Try to get from query or auth if available
    let hasUserPlayed = false;
    if (userId) {
      hasUserPlayed = freeTrial.gamePlays?.some(
        (play) => play.userId && play.userId.toString() === userId.toString()
      );
    }

    if (hasUserPlayed) {
      return res.json({ 
        valid: false, 
        message: 'You have already played the game with this code. Your seats are finished. You cannot play the game with any other seat.',
        alreadyPlayed: true,
        seatsFinished: true,
        isExpired: false
      });
    }

    res.json({
      valid: true,
      trial: {
        id: freeTrial._id,
        packageName: freeTrial.packageId?.name,
        remainingSeats: remainingSeats,
        maxSeats: freeTrial.maxSeats,
        usedSeats: freeTrial.usedSeats,
        codeApplications: freeTrial.codeApplications || 0,
        gamePlays: freeTrial.gamePlays?.length || 0,
        expiresAt: freeTrial.endDate,
        endDate: freeTrial.endDate,
        seatsAvailable: remainingSeats > 0,
        hasUserPlayed: hasUserPlayed // Indicate if user has already played
      },
    });
  } catch (error) {
    console.error('Error checking code:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start game play - increment seat count when user actually starts playing
router.post('/start-game-play', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    if (!req.userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const freeTrial = await FreeTrial.findOne({
      uniqueCode: code,
    })
      .populate('packageId', 'name');

    if (!freeTrial) {
      return res.status(404).json({ error: 'Invalid trial code' });
    }

    // Check if trial is expired
    if (new Date() > new Date(freeTrial.endDate)) {
      return res.status(400).json({ error: 'This trial code has expired' });
    }

    // Check if trial is still active
    if (freeTrial.status !== 'active') {
      return res.status(400).json({ error: 'This trial code is no longer active' });
    }

    // Check if seats are available BEFORE starting game
    const maxSeats = freeTrial.maxSeats || 2;
    if (freeTrial.usedSeats >= maxSeats) {
      return res.status(400).json({ 
        error: `You have only ${maxSeats} seat${maxSeats > 1 ? 's' : ''}. Your seats are completed.`,
        seatsFull: true,
        maxSeats: maxSeats,
        usedSeats: freeTrial.usedSeats
      });
    }

    // Check if this user has already played with this code
    const hasUserPlayed = freeTrial.gamePlays?.some(
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
    freeTrial.usedSeats += 1;
    
    // Track game play
    freeTrial.gamePlays = freeTrial.gamePlays || [];
    freeTrial.gamePlays.push({
      userId: req.userId,
      playedAt: new Date(),
    });

    // Update status if all seats used
    if (freeTrial.usedSeats >= freeTrial.maxSeats) {
      freeTrial.status = 'completed';
    }

    await freeTrial.save();

    // Update linked lead if trial is completed
    if (freeTrial.status === 'completed') {
      try {
        const Lead = require('../models/Lead');
        const linkedLead = await Lead.findOne({ linkedTrialIds: freeTrial._id });
        if (linkedLead) {
          linkedLead.demoCompleted = true;
          linkedLead.demoRequested = true;
          linkedLead.engagementCount = (linkedLead.engagementCount || 0) + 1;
          linkedLead.lastContactedAt = new Date();
          // Auto-calculate status (demo completed = hot lead)
          linkedLead.status = linkedLead.calculateStatus();
          await linkedLead.save();
        }
      } catch (leadError) {
        console.error('Error updating linked lead:', leadError);
        // Don't fail the request if lead update fails
      }
    }

    // Update organization seatUsage if free trial belongs to one
    if (freeTrial.organizationId) {
      try {
        const Organization = require('../models/Organization');
        const organization = await Organization.findById(freeTrial.organizationId);
        if (organization) {
          // Calculate total used seats from all transactions and free trials for this organization
          const orgTransactions = await Transaction.find({ 
            organizationId: freeTrial.organizationId,
            status: 'paid'
          });
          const orgFreeTrials = await FreeTrial.find({ 
            organizationId: freeTrial.organizationId
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

    res.json({
      message: 'Game play started successfully',
      trial: {
        ...freeTrial.toObject(),
        remainingSeats: freeTrial.maxSeats - freeTrial.usedSeats,
        maxSeats: freeTrial.maxSeats,
        usedSeats: freeTrial.usedSeats,
        codeApplications: freeTrial.codeApplications || 0,
        gamePlays: freeTrial.gamePlays?.length || 0,
        endDate: freeTrial.endDate,
      },
    });
  } catch (error) {
    console.error('Error starting game play:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;

