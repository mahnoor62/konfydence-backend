const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const GameProgress = require('../models/GameProgress');
const Card = require('../models/Card');
const User = require('../models/User');

const router = express.Router();

// Drop old unique index on userId only (one-time migration)
let oldIndexDropped = false;
GameProgress.dropOldIndex().then(dropped => {
  if (dropped) {
    oldIndexDropped = true;
  }
}).catch(err => {
  console.log('Index migration check:', err.message);
});

// Save game progress
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      productId,
      levelNumber,
      cards, // Cards array with card-wise data
      totalScore,
      maxScore,
      correctAnswers,
      totalQuestions,
      percentageScore,
      riskLevel
    } = req.body;

    console.log(`📊 Saving game progress - User: ${req.userId}, Level: ${levelNumber}, Product: ${productId}, Cards: ${cards?.length || 0}`);
    console.log(`📦 Request body:`, {
      productId: productId,
      levelNumber: levelNumber,
      cardsCount: cards?.length || 0,
      totalScore: totalScore,
      correctAnswers: correctAnswers,
      totalQuestions: totalQuestions
    });

    // Validation
    if (!levelNumber) {
      console.error('❌ Missing levelNumber');
      return res.status(400).json({ error: 'Missing required field: levelNumber' });
    }

    if (levelNumber < 1 || levelNumber > 3) {
      console.error(`❌ Invalid levelNumber: ${levelNumber}`);
      return res.status(400).json({ error: 'Level number must be between 1 and 3' });
    }

    if (!productId) {
      console.error('❌ Missing productId');
      return res.status(400).json({ error: 'Missing required field: productId' });
    }

    // Cards array validation - allow empty array but must be an array
    if (!cards || !Array.isArray(cards)) {
      return res.status(400).json({ error: 'Missing required field: cards array' });
    }
    
    // If cards array is empty, create empty progress entry (user started but didn't answer questions)
    // This ensures progress is saved even if user only plays one level without completing it

    // Get user
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Process cards array (handle empty array case)
    const processedCards = cards.length > 0 ? cards.map(card => {
      // Ensure cardId is properly formatted
      let cardId = card.cardId;
      if (cardId && typeof cardId === 'object') {
        cardId = cardId._id || cardId.id || cardId;
      }
      
      return {
        cardId: cardId,
        cardTitle: card.cardTitle || '',
        questions: card.questions || [],
        cardTotalScore: card.cardTotalScore || 0,
        cardMaxScore: card.cardMaxScore || 0,
        cardCorrectAnswers: card.cardCorrectAnswers || 0,
        cardTotalQuestions: card.cardTotalQuestions || 0,
        cardPercentageScore: card.cardPercentageScore || 0
      };
    }) : [];
    
    console.log(`📝 Processed ${processedCards.length} cards for level ${levelNumber}`);

    // Use provided stats or calculate from cards (handle empty cards case)
    const finalTotalScore = totalScore !== undefined ? totalScore : (processedCards.length > 0 ? processedCards.reduce((sum, card) => sum + card.cardTotalScore, 0) : 0);
    const finalCorrectAnswers = correctAnswers !== undefined ? correctAnswers : (processedCards.length > 0 ? processedCards.reduce((sum, card) => sum + card.cardCorrectAnswers, 0) : 0);
    const finalTotalQuestions = totalQuestions !== undefined ? totalQuestions : (processedCards.length > 0 ? processedCards.reduce((sum, card) => sum + card.cardTotalQuestions, 0) : 0);
    const finalMaxScore = maxScore !== undefined ? maxScore : (finalTotalQuestions > 0 ? finalTotalQuestions * 4 : 0);
    const finalPercentageScore = percentageScore !== undefined ? percentageScore : (finalMaxScore > 0 ? Math.round((finalTotalScore / finalMaxScore) * 100) : 0);
    
    // Calculate risk level based on percentage score if not provided
    let finalRiskLevel = riskLevel;
    if (!finalRiskLevel && finalPercentageScore !== undefined) {
      if (finalPercentageScore >= 84) {
        finalRiskLevel = 'Confident';
      } else if (finalPercentageScore >= 44) {
        finalRiskLevel = 'Cautious';
      } else {
        finalRiskLevel = 'Vulnerable';
      }
    }

    // Get the first cardId from cards (if available) for top-level cardId
    let firstCardId = null;
    if (processedCards.length > 0 && processedCards[0].cardId) {
      firstCardId = processedCards[0].cardId;
      // Ensure cardId is a valid ObjectId string
      if (typeof firstCardId === 'object' && firstCardId._id) {
        firstCardId = firstCardId._id;
      } else if (typeof firstCardId === 'object' && firstCardId.id) {
        firstCardId = firstCardId.id;
      }
    }

    console.log(`🔍 Looking for existing progress - User: ${req.userId}, Level: ${levelNumber}`);

    // IMPORTANT: Check if user already completed all 3 levels BEFORE we save/update progress
    // This prevents double-counting when user plays again
    let wasAlreadyCompletedBefore = false;
    if (levelNumber === 3) {
      const allProgressBefore = await GameProgress.find({ 
        userId: req.userId
      });
      
      const level1CompleteBefore = allProgressBefore.some(p => 
        p.levelNumber === 1 && p.completedAt && p.cards && p.cards.length > 0
      );
      const level2CompleteBefore = allProgressBefore.some(p => 
        p.levelNumber === 2 && p.completedAt && p.cards && p.cards.length > 0
      );
      const level3CompleteBefore = allProgressBefore.some(p => 
        p.levelNumber === 3 && p.completedAt && p.cards && p.cards.length > 0
      );
      
      wasAlreadyCompletedBefore = level1CompleteBefore && level2CompleteBefore && level3CompleteBefore;
      console.log(`🔍 Check before save: wasAlreadyCompletedBefore = ${wasAlreadyCompletedBefore}`);
    }

    // Find or create progress document for this user and level (one document per user per level)
    let progress = await GameProgress.findOne({ 
      userId: req.userId, 
      levelNumber: levelNumber 
    });
    
    console.log(`📋 Existing progress found: ${progress ? 'Yes' : 'No'}`);

    if (!progress) {
      // Create new progress document for this level
      try {
        console.log(`✅ Creating new progress for level ${levelNumber}`);
        progress = await GameProgress.create({
          userId: req.userId,
          cardId: firstCardId || null,
          productId: productId,
          levelNumber: levelNumber,
          cards: processedCards,
          totalScore: finalTotalScore,
          maxScore: finalMaxScore,
          correctAnswers: finalCorrectAnswers,
          totalQuestions: finalTotalQuestions,
          percentageScore: finalPercentageScore,
          riskLevel: finalRiskLevel,
          isDemo: req.body.isDemo || false,
          completedAt: new Date()
        });
        console.log(`✅ Progress created successfully for level ${levelNumber} - ID: ${progress._id}`);
      } catch (createError) {
        // Handle old unique index on userId only
        if (createError.code === 11000 && createError.keyPattern && createError.keyPattern.userId && !createError.keyPattern.levelNumber) {
          console.log('⚠️ Old unique index detected, dropping it...');
          try {
            // Drop the old index
            await GameProgress.collection.dropIndex('userId_1');
            console.log('✅ Dropped old userId_1 unique index');
            // Retry creating the document
            progress = await GameProgress.create({
              userId: req.userId,
              cardId: firstCardId || null,
              productId: productId,
              levelNumber: levelNumber,
              cards: processedCards,
              totalScore: finalTotalScore,
              maxScore: finalMaxScore,
              correctAnswers: finalCorrectAnswers,
              totalQuestions: finalTotalQuestions,
              percentageScore: finalPercentageScore,
              riskLevel: finalRiskLevel,
              isDemo: req.body.isDemo || false,
              completedAt: new Date()
            });
          } catch (retryError) {
            // If still fails, check if document exists (race condition)
            progress = await GameProgress.findOne({ 
              userId: req.userId, 
              levelNumber: levelNumber 
            });
            if (!progress) {
              throw createError; // Re-throw original error if still can't create
            }
          }
        } else {
          throw createError; // Re-throw if it's a different error
        }
      }
    } else {
      // Update existing progress for this level
      console.log(`🔄 Updating existing progress for level ${levelNumber}`);
      progress.cardId = firstCardId || progress.cardId;
      progress.productId = productId;
      progress.cards = processedCards;
      progress.totalScore = finalTotalScore;
      progress.maxScore = finalMaxScore;
      progress.correctAnswers = finalCorrectAnswers;
      progress.totalQuestions = finalTotalQuestions;
      progress.percentageScore = finalPercentageScore;
      progress.riskLevel = finalRiskLevel;
      progress.isDemo = req.body.isDemo !== undefined ? req.body.isDemo : progress.isDemo;
      progress.completedAt = new Date();

      await progress.save();
      console.log(`✅ Progress updated successfully for level ${levelNumber}`);
    }

    // Populate references for response
    await progress.populate('productId', 'name');
    await progress.populate('cardId', 'title referenceCode category');
    
    // Populate cardId in cards array
    const Card = require('../models/Card');
    if (progress.cards && Array.isArray(progress.cards)) {
      for (let card of progress.cards) {
        if (card.cardId && typeof card.cardId !== 'object') {
          try {
            const cardDoc = await Card.findById(card.cardId).select('title referenceCode category');
            if (cardDoc) {
              card.cardId = cardDoc;
            }
          } catch (err) {
            console.error('Error populating card in cards array:', err);
          }
        }
      }
    }
    
    // Check if user has completed all 3 levels, and increment seat count if so
    // Only increment when level 3 is saved and all 3 levels are completed
    // CRITICAL: For demo users (B2C, B2B, B2E), seat increment is handled by increment-seat-on-completion endpoint
    // So we skip seat increment here for demo users to prevent duplicate increments
    if (levelNumber === 3) {
      try {
        // Check if this is a demo user by checking if there's a free trial with targetAudience
        const FreeTrial = require('../models/FreeTrial');
        const Transaction = require('../models/Transaction');
        
        // Check if user has a demo free trial
        const demoFreeTrial = await FreeTrial.findOne({
          'gamePlays.userId': req.userId,
          targetAudience: { $exists: true, $ne: null },
          isDemo: true
        });
        
        // If this is a demo user, skip seat increment here (it will be handled by increment-seat-on-completion endpoint)
        if (demoFreeTrial) {
          console.log(`🎮 Demo user detected - skipping seat increment in gameProgress (will be handled by increment-seat-on-completion endpoint)`);
        } else {
          // CRITICAL: For purchase users, seat increment is now handled by payments/increment-seat-on-completion endpoint
          // Skip seat increment here to prevent duplicate increments and keep flows separate
          console.log(`💰 Purchase user detected - skipping seat increment in gameProgress (will be handled by payments/increment-seat-on-completion endpoint)`);
          // Seat increment for purchase users is now handled by a separate endpoint in payments.js
          // This keeps demo and purchase flows completely separate
        }
      } catch (seatError) {
        // Don't fail progress saving if seat increment fails
        console.error('Error incrementing seat count:', seatError);
      }
    }

    console.log(`✅ Successfully saved/updated progress for user ${req.userId}, level ${levelNumber}`);
    res.status(201).json({
      message: 'Game progress saved successfully',
      progress: progress
    });
  } catch (error) {
    console.error('❌ Error saving game progress:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      keyPattern: error.keyPattern,
      userId: req.userId,
      levelNumber: req.body.levelNumber,
      productId: req.body.productId
    });
    res.status(500).json({ 
      error: 'Failed to save game progress: ' + error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get user's progress for a specific card
router.get('/card/:cardId', authenticateToken, async (req, res) => {
  try {
    const { cardId } = req.params;
    const Card = require('../models/Card');

    // Find all progress documents for this user (one per level)
    const allProgress = await GameProgress.find({
      userId: req.userId
    })
      .populate('productId', 'name')
      .sort({ levelNumber: 1 });

    if (!allProgress || allProgress.length === 0) {
      return res.json([]);
    }

    // Filter cards by cardId from all levels
    const result = [];
    for (let progress of allProgress) {
      const levelNum = progress.levelNumber;
      
      if (progress.cards && Array.isArray(progress.cards)) {
        // Find card matching the cardId
        const matchingCard = progress.cards.find(card => {
          const cardIdStr = card.cardId?._id?.toString() || card.cardId?.toString();
          return cardIdStr === cardId;
        });

        if (matchingCard && matchingCard.questions && matchingCard.questions.length > 0) {
          // Populate cardId if needed
          if (matchingCard.cardId && typeof matchingCard.cardId !== 'object') {
            try {
              const cardDoc = await Card.findById(matchingCard.cardId).select('title referenceCode category');
              if (cardDoc) {
                matchingCard.cardId = cardDoc;
              }
            } catch (err) {
              console.error('Error populating card:', err);
            }
          }

          result.push({
            levelNumber: levelNum,
            card: matchingCard,
            totalScore: matchingCard.cardTotalScore || 0,
            correctAnswers: matchingCard.cardCorrectAnswers || 0,
            totalQuestions: matchingCard.cardTotalQuestions || 0,
            maxScore: matchingCard.cardMaxScore || 0,
            percentageScore: matchingCard.cardPercentageScore || 0,
            completedAt: progress.completedAt
          });
        }
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching card progress:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// Get specific user's progress (for admin viewing)
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const Card = require('../models/Card');
    const Package = require('../models/Package');
    
    // Find all progress documents for this user (one per level)
    const allProgress = await GameProgress.find({
      userId: userId
    })
      .populate('productId', 'name level1 level2 level3')
      .populate('userId', 'name email')
      .populate('cardId', 'title referenceCode category')
      .sort({ levelNumber: 1 });

    if (!allProgress || allProgress.length === 0) {
      return res.json(null);
    }

    // Get package's included card IDs or product's level card IDs to filter
    let allowedCardIds = null;
    const firstProgress = allProgress[0];
    const Product = require('../models/Product');
    
    if (firstProgress.productId) {
      // If productId exists, get cards from product's level arrays
      const product = await Product.findById(firstProgress.productId).select('level1 level2 level3');
      if (product) {
        // Combine all level arrays for filtering
        const allProductCardIds = [
          ...(product.level1 || []),
          ...(product.level2 || []),
          ...(product.level3 || [])
        ];
        allowedCardIds = allProductCardIds.map(id => id.toString());
      }
    }

    // Combine all levels into a single response structure
    const combinedProgress = {
      userId: firstProgress.userId,
      productId: firstProgress.productId,
      level1: [],
      level1Stats: { totalScore: 0, maxScore: 0, correctAnswers: 0, totalQuestions: 0, percentageScore: 0, riskLevel: null, completedAt: null },
      level2: [],
      level2Stats: { totalScore: 0, maxScore: 0, correctAnswers: 0, totalQuestions: 0, percentageScore: 0, riskLevel: null, completedAt: null },
      level3: [],
      level3Stats: { totalScore: 0, maxScore: 0, correctAnswers: 0, totalQuestions: 0, percentageScore: 0, riskLevel: null, completedAt: null },
      createdAt: firstProgress.createdAt,
      updatedAt: allProgress[allProgress.length - 1].updatedAt
    };

    // Process each level document
    for (let progress of allProgress) {
      const levelNum = progress.levelNumber;
      const levelKey = `level${levelNum}`;
      const statsKey = `${levelKey}Stats`;
      
      // Use cards array
      let filteredCards = [];
      
      if (progress.cards && Array.isArray(progress.cards) && progress.cards.length > 0) {
        for (let card of progress.cards) {
          const cardId = card.cardId?._id?.toString() || card.cardId?.toString();
          
          // Filter: only include cards that are in the purchased package/product
          if (allowedCardIds && cardId && !allowedCardIds.includes(cardId)) {
            continue; // Skip cards not in purchased package/product
          }
          
          // Populate cardId if needed
          if (card.cardId && typeof card.cardId !== 'object') {
            try {
              const cardDoc = await Card.findById(card.cardId).select('title referenceCode category');
              if (cardDoc) {
                card.cardId = cardDoc;
              }
            } catch (err) {
              console.error('Error populating card in cards array:', err);
            }
          }
          
          filteredCards.push(card);
        }
      }
      
      combinedProgress[levelKey] = filteredCards;
      
      // Use stats from the document
      combinedProgress[statsKey] = {
        totalScore: progress.totalScore || 0,
        maxScore: progress.maxScore || 0,
        correctAnswers: progress.correctAnswers || 0,
        totalQuestions: progress.totalQuestions || 0,
        percentageScore: progress.percentageScore || 0,
        riskLevel: progress.riskLevel || null,
        completedAt: progress.completedAt
      };
    }

    res.json(combinedProgress);
  } catch (error) {
    console.error('Error fetching user progress:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// Get user's all progress (for authenticated user)
router.get('/user', authenticateToken, async (req, res) => {
  try {
    const Card = require('../models/Card');
    const Package = require('../models/Package');
    
    // Find all progress documents for this user (one per level)
    const allProgress = await GameProgress.find({
      userId: req.userId
    })
      .populate('productId', 'name level1 level2 level3')
      .populate('cardId', 'title referenceCode category')
      .sort({ levelNumber: 1 });

    if (!allProgress || allProgress.length === 0) {
      return res.json(null);
    }

    // Get package's included card IDs or product's level card IDs to filter
    let allowedCardIds = null;
    const firstProgress = allProgress[0];
    const Product = require('../models/Product');
    
    if (firstProgress.productId) {
      // If productId exists, get cards from product's level arrays
      const product = await Product.findById(firstProgress.productId).select('level1 level2 level3');
      if (product) {
        // Combine all level arrays for filtering
        const allProductCardIds = [
          ...(product.level1 || []),
          ...(product.level2 || []),
          ...(product.level3 || [])
        ];
        allowedCardIds = allProductCardIds.map(id => id.toString());
      }
    }

    // Combine all levels into a single response structure
    const combinedProgress = {
      userId: firstProgress.userId,
      productId: firstProgress.productId,
      level1: [],
      level1Stats: { totalScore: 0, maxScore: 0, correctAnswers: 0, totalQuestions: 0, percentageScore: 0, riskLevel: null, completedAt: null },
      level2: [],
      level2Stats: { totalScore: 0, maxScore: 0, correctAnswers: 0, totalQuestions: 0, percentageScore: 0, riskLevel: null, completedAt: null },
      level3: [],
      level3Stats: { totalScore: 0, maxScore: 0, correctAnswers: 0, totalQuestions: 0, percentageScore: 0, riskLevel: null, completedAt: null },
      createdAt: firstProgress.createdAt,
      updatedAt: allProgress[allProgress.length - 1].updatedAt
    };

    // Process each level document
    for (let progress of allProgress) {
      const levelNum = progress.levelNumber;
      const levelKey = `level${levelNum}`;
      const statsKey = `${levelKey}Stats`;
      
      // Use cards array
      let filteredCards = [];
      
      if (progress.cards && Array.isArray(progress.cards) && progress.cards.length > 0) {
        for (let card of progress.cards) {
          const cardId = card.cardId?._id?.toString() || card.cardId?.toString();
          
          // Filter: only include cards that are in the purchased package/product
          if (allowedCardIds && cardId && !allowedCardIds.includes(cardId)) {
            continue; // Skip cards not in purchased package/product
          }
          
          // Populate cardId if needed
          if (card.cardId && typeof card.cardId !== 'object') {
            try {
              const cardDoc = await Card.findById(card.cardId).select('title referenceCode category');
              if (cardDoc) {
                card.cardId = cardDoc;
              }
            } catch (err) {
              console.error('Error populating card in cards array:', err);
            }
          }
          
          filteredCards.push(card);
        }
      }
      
      combinedProgress[levelKey] = filteredCards;
      
      // Use stats from the document
      combinedProgress[statsKey] = {
        totalScore: progress.totalScore || 0,
        maxScore: progress.maxScore || 0,
        correctAnswers: progress.correctAnswers || 0,
        totalQuestions: progress.totalQuestions || 0,
        percentageScore: progress.percentageScore || 0,
        riskLevel: progress.riskLevel || null,
        completedAt: progress.completedAt
      };
    }

    res.json(combinedProgress);
  } catch (error) {
    console.error('Error fetching user progress:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// Get leaderboard for a specific card and level
router.get('/leaderboard/card/:cardId/level/:levelNumber', async (req, res) => {
  try {
    const { cardId, levelNumber } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const levelNum = parseInt(levelNumber);

    // Find all progress documents for this level
    const allProgress = await GameProgress.find({
      levelNumber: levelNum
    })
      .populate('userId', 'name email')
      .populate('productId', 'name');

    // Filter and calculate scores for this specific card and level
    const leaderboard = allProgress
      .map(p => {
        const cardQuestions = p.questions.filter(q => {
          const qCardId = q.cardId?._id?.toString() || q.cardId?.toString();
          return qCardId === cardId;
        });

        if (cardQuestions.length > 0) {
          const cardScore = cardQuestions.reduce((sum, q) => sum + (q.points || 0), 0);
          return {
            userId: p.userId,
            levelNumber: levelNum,
            totalScore: cardScore,
            correctAnswers: cardQuestions.filter(q => q.isCorrect === true).length,
            totalQuestions: cardQuestions.length,
            completedAt: p.completedAt || p.updatedAt
          };
        }
        return null;
      })
      .filter(p => p !== null)
      .sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return new Date(a.completedAt) - new Date(b.completedAt);
      })
      .slice(0, limit);

    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get user's best score for a card and level
router.get('/best/card/:cardId/level/:levelNumber', authenticateToken, async (req, res) => {
  try {
    const { cardId, levelNumber } = req.params;
    const levelNum = parseInt(levelNumber);

    // Find progress document for this user and level
    const progress = await GameProgress.findOne({
      userId: req.userId,
      levelNumber: levelNum
    })
      .populate('productId', 'name')
      .populate('cardId', 'title referenceCode category');

    if (!progress) {
      return res.status(404).json({ error: 'No progress found' });
    }

    // Filter cards for this cardId
    const Card = require('../models/Card');
    let matchingCard = null;
    
    if (progress.cards && Array.isArray(progress.cards)) {
      matchingCard = progress.cards.find(card => {
        const cardIdStr = card.cardId?._id?.toString() || card.cardId?.toString();
        return cardIdStr === cardId;
      });
    }

    if (!matchingCard || !matchingCard.questions || matchingCard.questions.length === 0) {
      return res.status(404).json({ error: 'No progress found for this card and level' });
    }

    // Populate cardId if needed
    if (matchingCard.cardId && typeof matchingCard.cardId !== 'object') {
      try {
        const cardDoc = await Card.findById(matchingCard.cardId).select('title referenceCode category');
        if (cardDoc) {
          matchingCard.cardId = cardDoc;
        }
      } catch (err) {
        console.error('Error populating card:', err);
      }
    }

    const bestProgress = {
      ...progress.toObject(),
      levelNumber: levelNum,
      card: matchingCard,
      totalScore: matchingCard.cardTotalScore || 0,
      correctAnswers: matchingCard.cardCorrectAnswers || 0,
      totalQuestions: matchingCard.cardTotalQuestions || 0,
      maxScore: matchingCard.cardMaxScore || 0,
      percentageScore: matchingCard.cardPercentageScore || 0,
      completedAt: progress.completedAt
    };

    res.json(bestProgress);
  } catch (error) {
    console.error('Error fetching best progress:', error);
    res.status(500).json({ error: 'Failed to fetch best progress' });
  }
});

module.exports = router;

