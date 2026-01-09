const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Package = require('../models/Package');
const Organization = require('../models/Organization');
const Card = require('../models/Card');
// OrgUser model removed - using User table only for static data
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

    // Get transactions - Populate ALL fields
    const transactions = await Transaction.find({ userId: req.userId })
      .populate('packageId') // Populate ALL fields from Package table
      .populate('customPackageId') // Populate ALL fields from CustomPackage
      .populate('organizationId') // Populate ALL fields from Organization
      .populate('schoolId') // Populate ALL fields from School
      .populate('productId') // Populate ALL fields from Product
      .populate('gamePlays.userId') // Populate ALL fields from User in gamePlays
      .sort({ createdAt: -1 })
      .limit(20);

    // Get all transactions for user (to link with memberships) - Populate ALL fields
    const allTransactions = await Transaction.find({ userId: req.userId })
      .populate('packageId') // Populate ALL fields from Package table
      .populate('customPackageId') // Populate ALL fields from CustomPackage
      .populate('organizationId') // Populate ALL fields from Organization
      .populate('schoolId') // Populate ALL fields from School
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

    // Get game progress - new structure: one document per user per level
    // IMPORTANT: Populate freeTrialId to check isDemo flag
    const allProgressDocs = await GameProgress.find({ userId: req.userId })
      .populate('packageId', 'name')
      .populate('transactionId', 'packageId uniqueCode')
      .populate('cardId', 'title referenceCode category')
      .populate('freeTrialId', 'isDemo targetAudience')
      .sort({ levelNumber: 1 });
    
    // Check if any progress doc has isDemo=true from freeTrialId
    // This helps identify demo users even if isDemo field is not directly on GameProgress
    let hasDemoProgress = false;
    if (allProgressDocs.length > 0) {
      hasDemoProgress = allProgressDocs.some(doc => {
        // Check if freeTrialId has isDemo=true or targetAudience
        if (doc.freeTrialId) {
          const freeTrial = doc.freeTrialId;
          if (freeTrial.isDemo === true || freeTrial.targetAudience) {
            return true;
          }
        }
        // Also check direct isDemo field on GameProgress
        if (doc.isDemo === true) {
          return true;
        }
        return false;
      });
    }

    // Populate cardId in all cards arrays
    const Card = require('../models/Card');
    for (let progressDoc of allProgressDocs) {
      if (progressDoc.cards && Array.isArray(progressDoc.cards)) {
        for (let card of progressDoc.cards) {
          if (card.cardId && typeof card.cardId !== 'object') {
            try {
              const cardDoc = await Card.findById(card.cardId).select('title referenceCode category');
              if (cardDoc) {
                card.cardId = cardDoc;
              }
            } catch (err) {
              console.error('Error populating card:', err);
            }
          }
        }
      }
    }

    // Combine all level documents into a single structure for compatibility
    const gameProgressDoc = allProgressDocs.length > 0 ? {
      userId: allProgressDocs[0].userId,
      packageId: allProgressDocs[0].packageId,
      productId: allProgressDocs[0].productId,
      transactionId: allProgressDocs[0].transactionId,
      freeTrialId: allProgressDocs[0].freeTrialId,
      level1: allProgressDocs.find(p => p.levelNumber === 1)?.cards || [],
      level1Stats: allProgressDocs.find(p => p.levelNumber === 1) ? {
        totalScore: allProgressDocs.find(p => p.levelNumber === 1).totalScore,
        maxScore: allProgressDocs.find(p => p.levelNumber === 1).maxScore,
        correctAnswers: allProgressDocs.find(p => p.levelNumber === 1).correctAnswers,
        totalQuestions: allProgressDocs.find(p => p.levelNumber === 1).totalQuestions,
        percentageScore: allProgressDocs.find(p => p.levelNumber === 1).percentageScore,
        completedAt: allProgressDocs.find(p => p.levelNumber === 1).completedAt
      } : {},
      level2: allProgressDocs.find(p => p.levelNumber === 2)?.cards || [],
      level2Stats: allProgressDocs.find(p => p.levelNumber === 2) ? {
        totalScore: allProgressDocs.find(p => p.levelNumber === 2).totalScore,
        maxScore: allProgressDocs.find(p => p.levelNumber === 2).maxScore,
        correctAnswers: allProgressDocs.find(p => p.levelNumber === 2).correctAnswers,
        totalQuestions: allProgressDocs.find(p => p.levelNumber === 2).totalQuestions,
        percentageScore: allProgressDocs.find(p => p.levelNumber === 2).percentageScore,
        completedAt: allProgressDocs.find(p => p.levelNumber === 2).completedAt
      } : {},
      level3: allProgressDocs.find(p => p.levelNumber === 3)?.cards || [],
      level3Stats: allProgressDocs.find(p => p.levelNumber === 3) ? {
        totalScore: allProgressDocs.find(p => p.levelNumber === 3).totalScore,
        maxScore: allProgressDocs.find(p => p.levelNumber === 3).maxScore,
        correctAnswers: allProgressDocs.find(p => p.levelNumber === 3).correctAnswers,
        totalQuestions: allProgressDocs.find(p => p.levelNumber === 3).totalQuestions,
        percentageScore: allProgressDocs.find(p => p.levelNumber === 3).percentageScore,
        completedAt: allProgressDocs.find(p => p.levelNumber === 3).completedAt
      } : {}
    } : null;

    // Group game progress by transaction/membership - new structure: one document with level arrays
    const progressByTransaction = {};
    const progressByPackage = {};
    
    if (gameProgressDoc) {
      const transactionId = gameProgressDoc.transactionId?._id?.toString() || gameProgressDoc.transactionId?.toString();
      const packageId = gameProgressDoc.packageId?._id?.toString() || gameProgressDoc.packageId?.toString();
      
      // Process each level (1, 2, 3)
      for (let levelNum of [1, 2, 3]) {
        const levelArray = gameProgressDoc[`level${levelNum}`] || [];
        const levelStats = gameProgressDoc[`level${levelNum}Stats`] || {};
        
        if (levelArray.length === 0) continue;
        
        // levelArray now contains cards, not questions
        // Each card has: cardId, cardTitle, questions[], cardTotalScore, cardMaxScore, etc.
        
        // Group by transaction
        if (transactionId) {
          if (!progressByTransaction[transactionId]) {
            progressByTransaction[transactionId] = {
              transactionId: transactionId,
              packageId: packageId,
              packageName: gameProgressDoc.packageId?.name || 'Unknown',
              levelsByCard: {},
              totalLevelsPlayed: 0,
              totalScore: 0,
              maxScore: 0,
              correctAnswers: 0,
              totalQuestions: 0
            };
          }
          const txProgress = progressByTransaction[transactionId];
          
          // Process each card in the level
          levelArray.forEach(card => {
            const cardIdStr = card.cardId?._id?.toString() || card.cardId?.toString();
            if (!cardIdStr) return;
            
            if (!txProgress.levelsByCard[cardIdStr]) {
              const cardTitle = card.cardTitle || card.cardId?.title || 'Unknown Card';
              
              txProgress.levelsByCard[cardIdStr] = {
                cardId: cardIdStr,
                cardTitle: cardTitle,
                levels: [],
                totalScore: 0,
                maxScore: 0,
                correctAnswers: 0,
                totalQuestions: 0
              };
            }
            
            // Use card stats directly
            const cardScore = card.cardTotalScore || 0;
            const cardCorrect = card.cardCorrectAnswers || 0;
            const cardTotal = card.cardTotalQuestions || 0;
            const cardMaxScore = card.cardMaxScore || (cardTotal * 4);
            
            txProgress.levelsByCard[cardIdStr].levels.push({
              levelNumber: levelNum,
              score: cardScore,
              maxScore: cardMaxScore,
              correctAnswers: cardCorrect,
              totalQuestions: cardTotal,
              percentageScore: card.cardPercentageScore || (cardMaxScore > 0 ? Math.round((cardScore / cardMaxScore) * 100) : 0),
              completedAt: levelStats.completedAt
            });
            txProgress.levelsByCard[cardIdStr].totalScore += cardScore;
            txProgress.levelsByCard[cardIdStr].maxScore += cardMaxScore;
            txProgress.levelsByCard[cardIdStr].correctAnswers += cardCorrect;
            txProgress.levelsByCard[cardIdStr].totalQuestions += cardTotal;
          });
          
          txProgress.totalLevelsPlayed += 1;
          txProgress.totalScore += levelStats.totalScore || 0;
          txProgress.maxScore += levelStats.maxScore || 0;
          txProgress.correctAnswers += levelStats.correctAnswers || 0;
          txProgress.totalQuestions += levelStats.totalQuestions || 0;
        }
        
        // Also group by package (for free trials or progress without transaction)
        if (packageId) {
          if (!progressByPackage[packageId]) {
            progressByPackage[packageId] = {
              packageId: packageId,
              packageName: gameProgressDoc.packageId?.name || 'Unknown',
              levelsByCard: {},
              totalLevelsPlayed: 0,
              totalScore: 0,
              maxScore: 0,
              correctAnswers: 0,
              totalQuestions: 0
            };
          }
          const pkgProgress = progressByPackage[packageId];
          
          if (!transactionId) {
            // Process each card in the level
            levelArray.forEach(card => {
              const cardIdStr = card.cardId?._id?.toString() || card.cardId?.toString();
              if (!cardIdStr) return;
              
              if (!pkgProgress.levelsByCard[cardIdStr]) {
                const cardTitle = card.cardTitle || card.cardId?.title || 'Unknown Card';
                
                pkgProgress.levelsByCard[cardIdStr] = {
                  cardId: cardIdStr,
                  cardTitle: cardTitle,
                  levels: [],
                  totalScore: 0,
                  maxScore: 0,
                  correctAnswers: 0,
                  totalQuestions: 0
                };
              }
              
              // Use card stats directly
              const cardScore = card.cardTotalScore || 0;
              const cardCorrect = card.cardCorrectAnswers || 0;
              const cardTotal = card.cardTotalQuestions || 0;
              const cardMaxScore = card.cardMaxScore || (cardTotal * 4);
              
              pkgProgress.levelsByCard[cardIdStr].levels.push({
                levelNumber: levelNum,
                score: cardScore,
                maxScore: cardMaxScore,
                correctAnswers: cardCorrect,
                totalQuestions: cardTotal,
                percentageScore: card.cardPercentageScore || (cardMaxScore > 0 ? Math.round((cardScore / cardMaxScore) * 100) : 0),
                completedAt: levelStats.completedAt
              });
              pkgProgress.levelsByCard[cardIdStr].totalScore += cardScore;
              pkgProgress.levelsByCard[cardIdStr].maxScore += cardMaxScore;
              pkgProgress.levelsByCard[cardIdStr].correctAnswers += cardCorrect;
              pkgProgress.levelsByCard[cardIdStr].totalQuestions += cardTotal;
            });
            
            pkgProgress.totalLevelsPlayed += 1;
            pkgProgress.totalScore += levelStats.totalScore || 0;
            pkgProgress.maxScore += levelStats.maxScore || 0;
            pkgProgress.correctAnswers += levelStats.correctAnswers || 0;
            pkgProgress.totalQuestions += levelStats.totalQuestions || 0;
          }
        }
      }
    }

    // Calculate overall game progress (all memberships combined)
    const levelsByCard = {};
    let totalLevelsPlayed = 0;
    
    if (gameProgressDoc) {
      for (let levelNum of [1, 2, 3]) {
        const levelArray = gameProgressDoc[`level${levelNum}`] || [];
        const levelStats = gameProgressDoc[`level${levelNum}Stats`] || {};
        
        if (levelArray.length === 0) continue;
        totalLevelsPlayed += 1;
        
        // levelArray now contains cards, not questions
        // Process each card in the level
        levelArray.forEach(card => {
          const cardIdStr = card.cardId?._id?.toString() || card.cardId?.toString();
          if (!cardIdStr) return;
          
          if (!levelsByCard[cardIdStr]) {
            const cardTitle = card.cardTitle || card.cardId?.title || 'Unknown Card';
            
            levelsByCard[cardIdStr] = {
              cardId: cardIdStr,
              cardTitle: cardTitle,
              levels: [],
              totalScore: 0,
              maxScore: 0,
              correctAnswers: 0,
              totalQuestions: 0
            };
          }
          
          // Use card stats directly
          const cardScore = card.cardTotalScore || 0;
          const cardCorrect = card.cardCorrectAnswers || 0;
          const cardTotal = card.cardTotalQuestions || 0;
          const cardMaxScore = card.cardMaxScore || (cardTotal * 4);
          
          levelsByCard[cardIdStr].levels.push({
            levelNumber: levelNum,
            score: cardScore,
            maxScore: cardMaxScore,
            correctAnswers: cardCorrect,
            totalQuestions: cardTotal,
            percentageScore: card.cardPercentageScore || (cardMaxScore > 0 ? Math.round((cardScore / cardMaxScore) * 100) : 0),
            completedAt: levelStats.completedAt
          });
          levelsByCard[cardIdStr].totalScore += cardScore;
          levelsByCard[cardIdStr].maxScore += cardMaxScore;
          levelsByCard[cardIdStr].correctAnswers += cardCorrect;
          levelsByCard[cardIdStr].totalQuestions += cardTotal;
        });
      }
    }

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
        packageName: t.packageId?.name || t.customPackageId?.name || (t.packageType ? t.packageType.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : 'Unknown'),
        packageId: t.packageId?._id || t.packageId,
        packageType: t.packageType || null,
        createdAt: t.createdAt,
        stripePaymentIntentId: t.stripePaymentIntentId || null,
        maxSeats: t.maxSeats || null,
        usedSeats: t.usedSeats || null,
        uniqueCode: t.uniqueCode || null,
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
        })),
        // Include level arrays for level-wise display
        level1: gameProgressDoc?.level1 || [],
        level1Stats: gameProgressDoc?.level1Stats || {},
        level2: gameProgressDoc?.level2 || [],
        level2Stats: gameProgressDoc?.level2Stats || {},
        level3: gameProgressDoc?.level3 || [],
        level3Stats: gameProgressDoc?.level3Stats || {},
        // Add isDemo flag if gameProgress has freeTrialId with isDemo OR if any progress doc has isDemo
        // Check both freeTrialId.isDemo and direct isDemo field on GameProgress
        // hasDemoProgress is calculated above by checking all progress docs
        isDemo: hasDemoProgress || gameProgressDoc?.freeTrialId?.isDemo === true || !!gameProgressDoc?.freeTrialId?.targetAudience || gameProgressDoc?.isDemo === true
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

    // Get organization details with stats (OrgUser model removed, using User table only)
    const orgsWithStats = await Promise.all(
      organizations.map(async (org) => {
        const userCount = await User.countDocuments({
          organizationId: org._id,
          role: { $in: ['b2b_member', 'b2e_member'] },
          memberStatus: 'approved'
        });

        const activeContracts = await CustomPackage.countDocuments({
          organizationId: org._id,
          'contract.status': 'active',
        });

        return {
          ...org.toObject(),
          userCount: userCount,
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

    // Check if organization with same name already exists (case-insensitive)
    // Escape special regex characters in the name
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const duplicateOrg = await Organization.findOne({ 
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') } 
    });
    if (duplicateOrg) {
      return res.status(400).json({ error: `An organization with the name "${name.trim()}" already exists. Please use a different name.` });
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

    // Get organization users (OrgUser model removed, using User table only)
    const orgUsers = await User.find({ 
      organizationId: req.params.id,
      role: { $in: ['b2b_member', 'b2e_member'] },
      memberStatus: 'approved'
    }).select('name email isActive');

    // Get progress stats
    const totalUsers = orgUsers.length;
    const activeUsers = orgUsers.filter((user) => user.isActive).length;

    res.json({
      organization,
      orgUsers: orgUsers.map(user => ({
        userId: user,
        organizationId: req.params.id,
        assignedCustomPackageIds: [],
        isActive: user.isActive
      })),
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

