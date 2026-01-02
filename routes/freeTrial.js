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
    const { packageId, productId, targetAudience } = req.body;
    
    if (!packageId) {
      return res.status(400).json({ error: 'Package ID is required' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Restriction removed - anyone can create free trial now

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

    // Determine if this is a demo user
    // If targetAudience is provided, it's a demo request
    const isDemo = !!targetAudience; // true if targetAudience exists

    // Create free trial (7 days from now for regular, 14 days for demos)
    // Use milliseconds to ensure accuracy (avoiding setDate issues with month boundaries)
    const startDate = new Date();
    let endDate;
    
    if (isDemo) {
      // Demos get exactly 14 days including current day (13 days added to start date)
      // Example: If start is Jan 1, end is Jan 14 (14 days total: Jan 1, 2, 3...14)
      const thirteenDaysInMs = 13 * 24 * 60 * 60 * 1000;
      endDate = new Date(startDate.getTime() + thirteenDaysInMs);
      
      // Verify the calculation (including start day in count)
      const daysDiff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1; // +1 to include start day
      if (daysDiff !== 14) {
        console.error(`❌ Error: Demo end date calculation resulted in ${daysDiff} days instead of 14. Recalculating...`);
        endDate = new Date(startDate.getTime() + thirteenDaysInMs);
      }
      console.log(`📅 Demo trial date: startDate=${startDate.toISOString()}, endDate=${endDate.toISOString()}, duration=${daysDiff} days (should be 14, including start day)`);
    } else {
      // Regular free trials get exactly 7 days including current day (6 days added to start date)
      const sixDaysInMs = 6 * 24 * 60 * 60 * 1000;
      endDate = new Date(startDate.getTime() + sixDaysInMs);
    }

    const freeTrial = await FreeTrial.create({
      userId: req.userId,
      organizationId: user.organizationId,
      packageId: packageId,
      productId: productId ? productId : null,
      uniqueCode: uniqueCode,
      startDate: startDate,
      endDate: endDate,
      maxSeats: maxSeats, // Fixed 2 seats for free trial users
      usedSeats: 0,
      status: 'active',
      isDemo: isDemo, // true if targetAudience provided (demo), false otherwise (purchased)
      targetAudience: targetAudience || null, // Store target audience if provided
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
      .populate('packageId', 'name')
      .populate('productId', 'name level1 level2 level3')
      .populate('organizationId', 'name ownerId');

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

    // Check if trial is expired (compare dates, not times)
    const now = new Date();
    const endDate = new Date(freeTrial.endDate);
    // Set time to end of day for endDate to allow play on expiry date
    endDate.setHours(23, 59, 59, 999);
    const isExpired = now > endDate;
    
    if (isExpired) {
      freeTrial.status = 'expired';
      await freeTrial.save();
      return res.status(400).json({ 
        error: 'Demo has expired. You cannot play the game.',
        isExpired: true
      });
    }

    // Check if trial is still active
    if (freeTrial.status !== 'active') {
      return res.status(400).json({ error: 'This trial code is no longer active' });
    }

    // Check if user is a member of the organization (if code belongs to organization)
    // Note: Individual free trials (no organizationId) can be used by anyone
    if (freeTrial.organizationId) {
      const User = require('../models/User');
      const Organization = require('../models/Organization');
      const currentUser = await User.findById(req.userId);
      
      if (!currentUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const trialOrgId = freeTrial.organizationId?._id || freeTrial.organizationId;
      const organization = await Organization.findById(trialOrgId);
      
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      let isMember = false;
      let isOwner = false;

      // Check if user is owner
      if (organization.ownerId) {
        const orgOwnerId = organization.ownerId?._id || organization.ownerId;
        if (orgOwnerId.toString() === req.userId.toString()) {
          isOwner = true;
          isMember = true;
        }
      }

      // Check if user is a member
      if (!isMember) {
        const userOrgId = currentUser.organizationId?._id || currentUser.organizationId;
        if (userOrgId && userOrgId.toString() === trialOrgId.toString()) {
          isMember = true;
        }
      }

      // If not a member or owner, return error
      if (!isMember) {
        // FreeTrial only has organizationId, so always use "organization"
        return res.status(403).json({ 
          error: 'You are not a member of this organization. Only approved members can use this code to play the game.' 
        });
      }

      // Check if member status is approved (only for members, not owners)
      if (!isOwner && currentUser.memberStatus !== 'approved') {
        // FreeTrial only has organizationId, so always use "organization"
        return res.status(403).json({ 
          error: 'Your membership is not approved yet. Please wait for approval from the organization admin before using this code.' 
        });
      }
    }

    // Check if this user has already played with this code
    const hasUserPlayed = freeTrial.gamePlays?.some(
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
      .populate('packageId', 'name')
      .populate('productId', 'name level1 level2 level3');

    if (!freeTrial) {
      return res.json({ valid: false, message: 'Invalid code' });
    }

    // Check if trial is expired (compare dates, not times)
    const now = new Date();
    const endDate = new Date(freeTrial.endDate);
    // Set time to end of day for endDate to allow play on expiry date
    endDate.setHours(23, 59, 59, 999);
    const isExpired = now > endDate;
    
    if (isExpired) {
      // Update status to expired
      if (freeTrial.status === 'active') {
        freeTrial.status = 'expired';
        await freeTrial.save();
      }
      return res.json({ 
        valid: false, 
        message: 'Demo has expired. You cannot play the game.',
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
    
    // Check if current user has already played (if userId is available from query or auth)
    const userId = req.query.userId || req.userId;
    let hasUserPlayed = false;
    let userSeatUsed = false;
    
    if (userId) {
      hasUserPlayed = freeTrial.gamePlays?.some(
        (play) => play.userId && play.userId.toString() === userId.toString()
      );
      
      // Check if user has completed required levels (seat used)
      // For B2C: Only Level 1 required
      // For B2B/B2E: All 3 levels required
      if (hasUserPlayed) {
        const GameProgress = require('../models/GameProgress');
        const userProgress = await GameProgress.find({ userId: userId });
        
        const level1Complete = userProgress.some(p => p.levelNumber === 1 && p.completedAt && p.cards && p.cards.length > 0);
        const level2Complete = userProgress.some(p => p.levelNumber === 2 && p.completedAt && p.cards && p.cards.length > 0);
        const level3Complete = userProgress.some(p => p.levelNumber === 3 && p.completedAt && p.cards && p.cards.length > 0);
        
        // Check based on targetAudience
        const targetAudience = freeTrial.targetAudience;
        if (targetAudience === 'B2C') {
          userSeatUsed = level1Complete; // B2C: Only Level 1 required
        } else if (targetAudience === 'B2B' || targetAudience === 'B2E') {
          userSeatUsed = level1Complete && level2Complete && level3Complete; // B2B/B2E: All 3 levels required
        } else {
          // Default: All 3 levels required (for non-demo users)
          userSeatUsed = level1Complete && level2Complete && level3Complete;
        }
      }
    }
    
    // If all seats are used, show message
    if (seatsFull) {
      return res.json({ 
        valid: false, 
        message: 'All seats have been used.',
        seatsFull: true,
        remainingSeats: 0,
        maxSeats: maxSeats,
        usedSeats: freeTrial.usedSeats,
        isExpired: false,
        hasUserPlayed: hasUserPlayed,
        userSeatUsed: userSeatUsed
      });
    }
    
    // If user has used their seat but seats are still available
    if (userSeatUsed && !seatsFull) {
      return res.json({ 
        valid: false, 
        message: `You have already completed the game with this code. Your seat has been used.`,
        userSeatUsed: true,
        alreadyPlayed: true, // Add this for frontend check
        seatsFinished: false, // User's seat is finished, but other seats may be available
        remainingSeats: remainingSeats,
        maxSeats: maxSeats,
        usedSeats: freeTrial.usedSeats,
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
        hasUserPlayed: hasUserPlayed, // Indicate if user has already played
        isDemo: freeTrial.isDemo || false, // Track if this is a demo user
        targetAudience: freeTrial.targetAudience || null // Include target audience for demo users
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

    if (freeTrial.productId) {
      // Check if product has cards in any level
      const product = await Product.findById(freeTrial.productId).select('level1 level2 level3');
      if (product) {
        const hasLevel1Cards = product.level1 && product.level1.length > 0;
        const hasLevel2Cards = product.level2 && product.level2.length > 0;
        const hasLevel3Cards = product.level3 && product.level3.length > 0;
        cardsAvailable = hasLevel1Cards || hasLevel2Cards || hasLevel3Cards;
      }
    } else if (freeTrial.packageId) {
      // Check if package has cards with questions
      const packageDoc = await Package.findById(freeTrial.packageId).select('includedCardIds');
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
    freeTrial.gamePlays = freeTrial.gamePlays || [];
    // Only add to gamePlays if user is not already in the list
    const userAlreadyInGamePlays = freeTrial.gamePlays.some(
      (play) => play.userId && play.userId.toString() === req.userId.toString()
    );
    if (!userAlreadyInGamePlays) {
      freeTrial.gamePlays.push({
        userId: req.userId,
        playedAt: new Date(),
      });
      await freeTrial.save();
    }

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

// Increment seat when demo user completes game (all cards)
router.post('/increment-seat-on-completion', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    if (!req.userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    let freeTrial = await FreeTrial.findOne({
      uniqueCode: code,
    });

    if (!freeTrial) {
      return res.status(404).json({ error: 'Invalid trial code' });
    }

    // Check if this is a demo (has targetAudience)
    if (!freeTrial.targetAudience) {
      return res.status(400).json({ error: 'This endpoint is only for demo users' });
    }

    // CRITICAL: Check if user has completed all required levels before incrementing seat
    const GameProgress = require('../models/GameProgress');
    const userProgress = await GameProgress.find({ userId: req.userId });
    
    const level1Complete = userProgress.some(p => p.levelNumber === 1 && p.completedAt && p.cards && p.cards.length > 0);
    const level2Complete = userProgress.some(p => p.levelNumber === 2 && p.completedAt && p.cards && p.cards.length > 0);
    const level3Complete = userProgress.some(p => p.levelNumber === 3 && p.completedAt && p.cards && p.cards.length > 0);
    
    // For B2C: Only Level 1 required
    // For B2B/B2E: All 3 levels required
    const targetAudience = freeTrial.targetAudience;
    let allRequiredLevelsCompleted = false;
    
    if (targetAudience === 'B2C') {
      allRequiredLevelsCompleted = level1Complete;
    } else if (targetAudience === 'B2B' || targetAudience === 'B2E') {
      allRequiredLevelsCompleted = level1Complete && level2Complete && level3Complete;
    }
    
    // CRITICAL: If user has completed required levels, check if seat was already incremented
    // This prevents "Play Again" from incrementing seat again
    if (allRequiredLevelsCompleted) {
      // Reload freeTrial to get latest state (including gamePlays)
      freeTrial = await FreeTrial.findById(freeTrial._id);
      
      // Check if user has a gamePlays entry and if their seat was already incremented
      const userGamePlay = freeTrial.gamePlays?.find(
        (play) => play.userId && play.userId.toString() === req.userId.toString()
      );
      
      // CRITICAL: Check if user's seat was already incremented (completed flag = true)
      // gamePlays entry is created when user STARTS playing (without completed flag)
      // completed flag is set to true ONLY when seat is incremented
      // So: completed = true → "Play Again" (seat already used)
      //     completed = false/undefined → First time completion (seat not used yet)
      if (userGamePlay && userGamePlay.completed === true) {
        console.log(`⚠️ User has completed required levels AND seat was already incremented - this is "Play Again" scenario`);
        console.log(`ℹ️ Skipping seat increment - user can play again but seat count will not change`);
        return res.status(400).json({ 
          error: 'You have already completed the game with this code. Your seat has been used.',
          alreadyPlayed: true,
          seatsFinished: true
        });
      }
      
      // If levels are completed but gamePlays.completed is false/undefined
      // This is first time completion (levels just completed, seat not incremented yet)
      // Proceed with increment - the atomic update will set completed flag
      console.log(`ℹ️ User has completed required levels for the first time - proceeding with seat increment`);
    }
    
    // If required levels are not completed yet, return error
    if (!allRequiredLevelsCompleted) {
      const requiredLevels = targetAudience === 'B2C' ? 'Level 1' : 'all 3 levels (Level 1, 2, and 3)';
      return res.status(400).json({ 
        error: `You must complete ${requiredLevels} before your seat can be counted.`,
        levelsNotCompleted: true,
        level1Complete,
        level2Complete,
        level3Complete
      });
    }

    // Check if seats are available
    const maxSeats = freeTrial.maxSeats || 2;
    if (freeTrial.usedSeats >= maxSeats) {
      return res.status(400).json({ 
        error: `You have only ${maxSeats} seat${maxSeats > 1 ? 's' : ''}. Your seats are completed.`,
        seatsFull: true
      });
    }

    // CRITICAL: Reload freeTrial again to get latest state before checking gamePlays
    // This ensures we have the most up-to-date gamePlays data
    freeTrial = await FreeTrial.findById(freeTrial._id);
    
    // Check if user's seat was already incremented (prevent duplicate increments)
    // Check if user already has a completed game play entry
    freeTrial.gamePlays = freeTrial.gamePlays || [];
    const existingPlayIndex = freeTrial.gamePlays.findIndex(
      (play) => play.userId && play.userId.toString() === req.userId.toString()
    );
    
    // CRITICAL: Check if user's seat was already incremented (completed flag = true)
    // gamePlays entry is created when user STARTS playing (without completed flag)
    // completed flag is set to true ONLY when seat is incremented
    // So: completed = true → "Play Again" (seat already used) → Don't increment
    //     completed = false/undefined → First time completion (seat not used yet) → Increment
    const userGamePlayEntry = existingPlayIndex >= 0 ? freeTrial.gamePlays[existingPlayIndex] : null;
    if (allRequiredLevelsCompleted && userGamePlayEntry && userGamePlayEntry.completed === true) {
      console.log(`⚠️ User has completed required levels AND seat was already incremented - this is "Play Again" scenario`);
      console.log(`ℹ️ Skipping seat increment - user can play again but seat count will not change`);
      return res.status(400).json({ 
        error: 'You have already completed the game with this code. Your seat has been used.',
        alreadyPlayed: true,
        seatsFinished: true
      });
    }
    
    // Use atomic update to prevent race conditions and duplicate increments
    // Only increment if user's game play is not already completed
    const updateQuery = { $inc: { usedSeats: 1 } };
    
    // Update or add game play entry
    if (existingPlayIndex >= 0) {
      updateQuery.$set = {
        [`gamePlays.${existingPlayIndex}.completed`]: true,
        [`gamePlays.${existingPlayIndex}.completedAt`]: new Date()
      };
    } else {
      updateQuery.$push = {
        gamePlays: {
          userId: req.userId,
          startedAt: new Date(),
          completed: true,
          completedAt: new Date()
        }
      };
    }
    
    // Check if all seats will be used after increment
    const newUsedSeats = (freeTrial.usedSeats || 0) + 1;
    if (newUsedSeats >= maxSeats) {
      if (!updateQuery.$set) updateQuery.$set = {};
      updateQuery.$set.status = 'completed';
    }
    
    // Use findOneAndUpdate with condition to prevent duplicate increment
    // Only update if user's gamePlays entry doesn't have completed = true
    // This allows first time completion (gamePlays exists but completed = false/undefined)
    // But prevents "Play Again" (gamePlays exists and completed = true)
    const updatedFreeTrial = await FreeTrial.findOneAndUpdate(
      {
        _id: freeTrial._id,
        $or: [
          { gamePlays: { $exists: false } },
          { gamePlays: { $size: 0 } },
          {
            gamePlays: {
              $not: {
                $elemMatch: {
                  userId: req.userId,
                  completed: true
                }
              }
            }
          }
        ]
      },
      updateQuery,
      { new: true }
    );
    
    if (!updatedFreeTrial) {
      // Update was skipped because condition wasn't met (user already completed)
      return res.status(400).json({ 
        error: 'You have already completed the game with this code. Your seat has been used.',
        alreadyPlayed: true,
        seatsFinished: true
      });
    }
    
    // Update freeTrial reference
    freeTrial = updatedFreeTrial;

    res.json({
      message: 'Seat incremented successfully',
      trial: {
        ...freeTrial.toObject(),
        remainingSeats: freeTrial.maxSeats - freeTrial.usedSeats,
        maxSeats: freeTrial.maxSeats,
        usedSeats: freeTrial.usedSeats,
      },
    });
  } catch (error) {
    console.error('Error incrementing seat on completion:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;

