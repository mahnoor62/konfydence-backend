const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Package = require('../models/Package');
const Organization = require('../models/Organization');
const Card = require('../models/Card');
const OrgUser = require('../models/OrgUser');
const CustomPackage = require('../models/CustomPackage');
const GameProgress = require('../models/GameProgress');

const router = express.Router();

    // Get user dashboard data
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('memberships.packageId', 'name pricing includedCardIds')
      .populate('progress.cardProgress.cardId', 'title category')
      .populate('progress.packageProgress.packageId', 'name');

    // Get organizations for B2B/B2E users
    let organizations = [];
    if (user.role === 'b2b_user' || user.role === 'b2e_user') {
      organizations = await Organization.find({
        $or: [
          { 'primaryContact.email': user.email },
          { 'additionalContacts.email': user.email },
        ],
      })
        .populate('customPackages')
        .sort({ createdAt: -1 })
        .limit(10);
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get transactions
    const transactions = await Transaction.find({ userId: req.userId })
      .populate('packageId', 'name pricing')
      .populate('customPackageId', 'name')
      .sort({ createdAt: -1 })
      .limit(20);

    // Get all transactions for user (to link with memberships)
    const allTransactions = await Transaction.find({ userId: req.userId })
      .populate('packageId', 'name')
      .sort({ createdAt: -1 });

    // Create a map of packageId to transactions
    const packageToTransactions = {};
    allTransactions.forEach(tx => {
      const pkgId = tx.packageId?._id?.toString() || tx.packageId?.toString();
      if (pkgId) {
        if (!packageToTransactions[pkgId]) {
          packageToTransactions[pkgId] = [];
        }
        packageToTransactions[pkgId].push(tx._id.toString());
      }
    });

    // Get game progress (all levels completed by user)
    const gameProgress = await GameProgress.find({ userId: req.userId })
      .populate('cardId', 'title referenceCode category')
      .populate('packageId', 'name')
      .populate('transactionId', 'packageId uniqueCode')
      .sort({ completedAt: -1 });

    // Group game progress by transaction/membership
    const progressByTransaction = {};
    const progressByPackage = {};
    
    gameProgress.forEach((progress) => {
      const transactionId = progress.transactionId?._id?.toString() || progress.transactionId?.toString();
      const packageId = progress.packageId?._id?.toString() || progress.packageId?.toString();
      
      // Group by transaction
      if (transactionId) {
        if (!progressByTransaction[transactionId]) {
          progressByTransaction[transactionId] = {
            transactionId: transactionId,
            packageId: packageId,
            packageName: progress.packageId?.name || 'Unknown',
            levelsByCard: {},
            totalLevelsPlayed: 0,
            totalScore: 0,
            maxScore: 0,
            correctAnswers: 0,
            totalQuestions: 0
          };
        }
        const txProgress = progressByTransaction[transactionId];
        const cardId = progress.cardId?._id?.toString() || progress.cardId?.toString();
        if (!txProgress.levelsByCard[cardId]) {
          txProgress.levelsByCard[cardId] = {
            cardId: cardId,
            cardTitle: progress.cardId?.title || 'Unknown Card',
            levels: [],
            totalScore: 0,
            maxScore: 0,
            correctAnswers: 0,
            totalQuestions: 0
          };
        }
        txProgress.levelsByCard[cardId].levels.push({
          levelNumber: progress.levelNumber,
          score: progress.totalScore,
          maxScore: progress.maxScore,
          correctAnswers: progress.correctAnswers,
          totalQuestions: progress.totalQuestions,
          percentageScore: progress.percentageScore,
          completedAt: progress.completedAt
        });
        txProgress.levelsByCard[cardId].totalScore += progress.totalScore;
        txProgress.levelsByCard[cardId].maxScore += progress.maxScore;
        txProgress.levelsByCard[cardId].correctAnswers += progress.correctAnswers;
        txProgress.levelsByCard[cardId].totalQuestions += progress.totalQuestions;
        txProgress.totalLevelsPlayed += 1;
        txProgress.totalScore += progress.totalScore;
        txProgress.maxScore += progress.maxScore;
        txProgress.correctAnswers += progress.correctAnswers;
        txProgress.totalQuestions += progress.totalQuestions;
      }
      
      // Also group by package (for free trials or progress without transaction)
      if (packageId) {
        if (!progressByPackage[packageId]) {
          progressByPackage[packageId] = {
            packageId: packageId,
            packageName: progress.packageId?.name || 'Unknown',
            levelsByCard: {},
            totalLevelsPlayed: 0,
            totalScore: 0,
            maxScore: 0,
            correctAnswers: 0,
            totalQuestions: 0
          };
        }
        const pkgProgress = progressByPackage[packageId];
        const cardId = progress.cardId?._id?.toString() || progress.cardId?.toString();
        if (!pkgProgress.levelsByCard[cardId]) {
          pkgProgress.levelsByCard[cardId] = {
            cardId: cardId,
            cardTitle: progress.cardId?.title || 'Unknown Card',
            levels: [],
            totalScore: 0,
            maxScore: 0,
            correctAnswers: 0,
            totalQuestions: 0
          };
        }
        // Only add if not already added via transaction
        if (!transactionId) {
          pkgProgress.levelsByCard[cardId].levels.push({
            levelNumber: progress.levelNumber,
            score: progress.totalScore,
            maxScore: progress.maxScore,
            correctAnswers: progress.correctAnswers,
            totalQuestions: progress.totalQuestions,
            percentageScore: progress.percentageScore,
            completedAt: progress.completedAt
          });
          pkgProgress.levelsByCard[cardId].totalScore += progress.totalScore;
          pkgProgress.levelsByCard[cardId].maxScore += progress.maxScore;
          pkgProgress.levelsByCard[cardId].correctAnswers += progress.correctAnswers;
          pkgProgress.levelsByCard[cardId].totalQuestions += progress.totalQuestions;
          pkgProgress.totalLevelsPlayed += 1;
          pkgProgress.totalScore += progress.totalScore;
          pkgProgress.maxScore += progress.maxScore;
          pkgProgress.correctAnswers += progress.correctAnswers;
          pkgProgress.totalQuestions += progress.totalQuestions;
        }
      }
    });

    // Calculate overall game progress (all memberships combined)
    const totalLevelsPlayed = gameProgress.length;
    const levelsByCard = {};
    gameProgress.forEach((progress) => {
      const cardId = progress.cardId?._id?.toString() || progress.cardId?.toString();
      if (!levelsByCard[cardId]) {
        levelsByCard[cardId] = {
          cardId: cardId,
          cardTitle: progress.cardId?.title || 'Unknown Card',
          levels: [],
          totalScore: 0,
          maxScore: 0,
          correctAnswers: 0,
          totalQuestions: 0
        };
      }
      levelsByCard[cardId].levels.push({
        levelNumber: progress.levelNumber,
        score: progress.totalScore,
        maxScore: progress.maxScore,
        correctAnswers: progress.correctAnswers,
        totalQuestions: progress.totalQuestions,
        percentageScore: progress.percentageScore,
        completedAt: progress.completedAt
      });
      levelsByCard[cardId].totalScore += progress.totalScore;
      levelsByCard[cardId].maxScore += progress.maxScore;
      levelsByCard[cardId].correctAnswers += progress.correctAnswers;
      levelsByCard[cardId].totalQuestions += progress.totalQuestions;
    });

    // Calculate overall game progress percentage
    const overallGameScore = Object.values(levelsByCard).reduce((sum, card) => sum + card.totalScore, 0);
    const overallMaxScore = Object.values(levelsByCard).reduce((sum, card) => sum + card.maxScore, 0);
    const overallGamePercentage = overallMaxScore > 0 ? Math.round((overallGameScore / overallMaxScore) * 100) : 0;

    // Get all active memberships (not just one)
    const now = new Date();
    const activeMemberships = user.memberships.filter(
      (m) => m.status === 'active' && (!m.endDate || new Date(m.endDate) > now)
    );

    // Get the most recent active membership for primary display
    const primaryMembership = activeMemberships.length > 0
      ? activeMemberships.sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0]
      : null;

    // Calculate progress stats
    const totalCards = user.progress.cardProgress.length;
    const completedCards = user.progress.cardProgress.filter((cp) => cp.completed).length;
    const totalProgress = totalCards > 0 ? (completedCards / totalCards) * 100 : 0;

    // Get package progress
    const packageProgress = user.progress.packageProgress.map((pp) => ({
      packageId: pp.packageId?._id || pp.packageId,
      packageName: pp.packageId?.name || 'Unknown',
      completedCards: pp.completedCards,
      totalCards: pp.totalCards,
      completionPercentage: pp.completionPercentage,
    }));

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePhoto: user.profilePhoto,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
      },
      // Primary membership (most recent active one)
      membership: primaryMembership
        ? {
            type: primaryMembership.membershipType,
            status: primaryMembership.status,
            startDate: primaryMembership.startDate,
            endDate: primaryMembership.endDate,
            package: primaryMembership.packageId,
          }
        : null,
      // All active memberships with their game progress
      allMemberships: activeMemberships.map((m) => {
        const pkgId = m.packageId?._id?.toString() || m.packageId?.toString();
        const relatedTransactions = packageToTransactions[pkgId] || [];
        
        // Find game progress for this membership (by transaction or package)
        let membershipProgress = null;
        
        // First try to find by transaction
        for (const txId of relatedTransactions) {
          if (progressByTransaction[txId]) {
            membershipProgress = {
              totalLevelsPlayed: progressByTransaction[txId].totalLevelsPlayed,
              totalScore: progressByTransaction[txId].totalScore,
              maxScore: progressByTransaction[txId].maxScore,
              correctAnswers: progressByTransaction[txId].correctAnswers,
              totalQuestions: progressByTransaction[txId].totalQuestions,
              percentageScore: progressByTransaction[txId].maxScore > 0 
                ? Math.round((progressByTransaction[txId].totalScore / progressByTransaction[txId].maxScore) * 100) 
                : 0,
              cards: Object.values(progressByTransaction[txId].levelsByCard).map(card => ({
                cardId: card.cardId,
                cardTitle: card.cardTitle,
                levels: card.levels,
                totalScore: card.totalScore,
                maxScore: card.maxScore,
                correctAnswers: card.correctAnswers,
                totalQuestions: card.totalQuestions,
                percentageScore: card.maxScore > 0 ? Math.round((card.totalScore / card.maxScore) * 100) : 0
              }))
            };
            break;
          }
        }
        
        // If no transaction progress, try package progress
        if (!membershipProgress && progressByPackage[pkgId]) {
          membershipProgress = {
            totalLevelsPlayed: progressByPackage[pkgId].totalLevelsPlayed,
            totalScore: progressByPackage[pkgId].totalScore,
            maxScore: progressByPackage[pkgId].maxScore,
            correctAnswers: progressByPackage[pkgId].correctAnswers,
            totalQuestions: progressByPackage[pkgId].totalQuestions,
            percentageScore: progressByPackage[pkgId].maxScore > 0 
              ? Math.round((progressByPackage[pkgId].totalScore / progressByPackage[pkgId].maxScore) * 100) 
              : 0,
            cards: Object.values(progressByPackage[pkgId].levelsByCard).map(card => ({
              cardId: card.cardId,
              cardTitle: card.cardTitle,
              levels: card.levels,
              totalScore: card.totalScore,
              maxScore: card.maxScore,
              correctAnswers: card.correctAnswers,
              totalQuestions: card.totalQuestions,
              percentageScore: card.maxScore > 0 ? Math.round((card.totalScore / card.maxScore) * 100) : 0
            }))
          };
        }
        
        return {
          id: m._id,
          type: m.membershipType,
          status: m.status,
          startDate: m.startDate,
          endDate: m.endDate,
          packageId: pkgId,
          package: m.packageId,
          gameProgress: membershipProgress
        };
      }),
      // All active packages (same as active memberships but with different structure)
      activePackages: activeMemberships.map((m) => ({
        id: m._id,
        packageId: m.packageId?._id || m.packageId,
        packageName: m.packageId?.name || 'Unknown',
        membershipType: m.membershipType,
        startDate: m.startDate,
        endDate: m.endDate,
      })),
      progress: {
        totalCards,
        completedCards,
        totalProgress: Math.round(totalProgress),
        cardProgress: user.progress.cardProgress.map((cp) => ({
          cardId: cp.cardId?._id || cp.cardId,
          cardTitle: cp.cardId?.title || 'Unknown',
          packageId: cp.packageId?._id || cp.packageId,
          completed: cp.completed,
          completedAt: cp.completedAt,
          progressPercentage: cp.progressPercentage,
        })),
        packageProgress,
      },
      transactions: transactions.map((t) => ({
        id: t._id,
        type: t.type,
        amount: t.amount,
        currency: t.currency,
        status: t.status,
        packageName: t.packageId?.name || t.customPackageId?.name || 'Unknown',
        createdAt: t.createdAt,
      })),
      // Game progress data
      gameProgress: {
        totalLevelsPlayed,
        overallPercentage: overallGamePercentage,
        overallScore: overallGameScore,
        overallMaxScore: overallMaxScore,
        cards: Object.values(levelsByCard).map(card => ({
          cardId: card.cardId,
          cardTitle: card.cardTitle,
          levels: card.levels,
          totalScore: card.totalScore,
          maxScore: card.maxScore,
          correctAnswers: card.correctAnswers,
          totalQuestions: card.totalQuestions,
          percentageScore: card.maxScore > 0 ? Math.round((card.totalScore / card.maxScore) * 100) : 0
        }))
      },
      // Organizations for B2B/B2E users
      organizations: organizations.map(org => ({
        id: org._id,
        name: org.name,
        segment: org.segment,
        customPackagesCount: org.customPackages?.length || 0,
        createdAt: org.createdAt
      })),
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, email } = req.body;
    const updateData = {};
    
    if (name !== undefined) updateData.name = name;
    
    // Email update requires special handling
    if (email !== undefined) {
      // Check if email is already taken by another user
      const existingUser = await User.findOne({ 
        email: email.toLowerCase().trim(),
        _id: { $ne: req.userId }
      });
      
      if (existingUser) {
        return res.status(400).json({ error: 'This email is already registered by another user' });
      }
      
      // If email is changed, mark as unverified
      const currentUser = await User.findById(req.userId);
      if (currentUser && currentUser.email !== email.toLowerCase().trim()) {
        updateData.email = email.toLowerCase().trim();
        updateData.isEmailVerified = false;
        // Clear verification token
        updateData.emailVerificationToken = undefined;
        updateData.emailVerificationExpiry = undefined;
      }
    }

    const user = await User.findByIdAndUpdate(req.userId, updateData, {
      new: true,
      runValidators: true,
    }).select('-passwordHash -emailVerificationToken -passwordResetToken');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error updating profile:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'This email is already registered' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle account status (disable/enable)
router.put('/account/toggle', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      message: user.isActive ? 'Account enabled' : 'Account disabled',
      isActive: user.isActive,
    });
  } catch (error) {
    console.error('Error toggling account:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's organizations (for B2B/B2E users)
router.get('/organizations', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get only user's own organization (linked during registration)
    let organizations = [];
    if (user.organizationId) {
      const organization = await Organization.findById(user.organizationId)
        .populate('customPackages');
      
      if (organization) {
        organizations = [organization];
      }
    } else {
      // Fallback: Find organizations where user is primary contact (for backward compatibility)
      organizations = await Organization.find({
        $or: [
          { 'primaryContact.email': user.email },
          { 'additionalContacts.email': user.email },
        ],
      })
        .populate('customPackages')
        .sort({ createdAt: -1 })
        .limit(1); // Only get the first one if multiple found
    }

    // Get organization details with stats
    const orgsWithStats = await Promise.all(
      organizations.map(async (org) => {
        const orgUsersCount = await OrgUser.countDocuments({
          organizationId: org._id,
        });

        const activeContracts = await CustomPackage.countDocuments({
          organizationId: org._id,
          'contract.status': 'active',
        });

        return {
          ...org.toObject(),
          userCount: orgUsersCount,
          activeContractsCount: activeContracts,
        };
      })
    );

    res.json(orgsWithStats);
  } catch (error) {
    console.error('Error fetching user organizations:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create organization (for B2B/B2E users)
router.post('/organizations', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only B2B/B2E users can create organizations
    if (user.role !== 'b2b_user' && user.role !== 'b2e_user') {
      return res.status(403).json({ error: 'Only B2B/B2E users can create organizations' });
    }

    // Check if user already has an organization
    if (user.organizationId) {
      return res.status(400).json({ error: 'You already have an organization. You can only have one organization.' });
    }

    const { name, type, segment, primaryContact } = req.body;

    if (!name || !type || !segment || !primaryContact || !primaryContact.name || !primaryContact.email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate segment matches user role
    if (user.role === 'b2b_user' && segment !== 'B2B') {
      return res.status(400).json({ error: 'B2B users can only create B2B organizations' });
    }
    if (user.role === 'b2e_user' && segment !== 'B2E') {
      return res.status(400).json({ error: 'B2E users can only create B2E organizations' });
    }

    const organization = await Organization.create({
      name,
      type,
      segment,
      primaryContact: {
        name: primaryContact.name,
        email: primaryContact.email.toLowerCase(),
        phone: primaryContact.phone || '',
        jobTitle: primaryContact.jobTitle || '',
      },
      status: 'prospect',
    });

    // Link organization to user
    user.organizationId = organization._id;
    await user.save();

    res.status(201).json(organization);
  } catch (error) {
    console.error('Error creating organization:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update organization (for B2B/B2E users)
router.put('/organizations/:id', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const organization = await Organization.findById(req.params.id);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Check if user has access to this organization (must be their linked organization)
    const hasAccess = user.organizationId && user.organizationId.toString() === req.params.id;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied. You can only access your own organization.' });
    }

    const { name, type, primaryContact } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (type) updateData.type = type;
    if (primaryContact) {
      updateData.primaryContact = {
        name: primaryContact.name || organization.primaryContact.name,
        email: primaryContact.email ? primaryContact.email.toLowerCase() : organization.primaryContact.email,
        phone: primaryContact.phone !== undefined ? primaryContact.phone : organization.primaryContact.phone,
        jobTitle: primaryContact.jobTitle !== undefined ? primaryContact.jobTitle : organization.primaryContact.jobTitle,
      };
    }

    const updatedOrg = await Organization.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json(updatedOrg);
  } catch (error) {
    console.error('Error updating organization:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get organization details (for B2B/B2E users)
router.get('/organizations/:id', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const organization = await Organization.findById(req.params.id)
      .populate('customPackages')
      .populate({
        path: 'customPackages',
        populate: {
          path: 'basePackageId',
          select: 'name description',
        },
      });

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Check if user has access to this organization (must be their linked organization)
    const hasAccess = user.organizationId && user.organizationId.toString() === req.params.id;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied. You can only access your own organization.' });
    }

    // Get organization users
    const orgUsers = await OrgUser.find({ organizationId: req.params.id })
      .populate('userId', 'name email')
      .populate('assignedCustomPackageIds');

    // Get progress stats
    const totalUsers = orgUsers.length;
    const activeUsers = orgUsers.filter((ou) => ou.isActive).length;

    res.json({
      organization,
      orgUsers,
      stats: {
        totalUsers,
        activeUsers,
        seatLimit: organization.seatUsage?.seatLimit || 0,
        usedSeats: organization.seatUsage?.usedSeats || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching organization:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

