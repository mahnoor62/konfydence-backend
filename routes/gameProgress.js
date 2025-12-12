const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const GameProgress = require('../models/GameProgress');
const Card = require('../models/Card');

const router = express.Router();

// Save game progress
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      cardId,
      packageId,
      productId,
      transactionId,
      freeTrialId,
      levelNumber,
      totalScore,
      maxScore,
      correctAnswers,
      totalQuestions
    } = req.body;

    // Validation
    if (!cardId || !levelNumber) {
      return res.status(400).json({ error: 'Missing required fields: cardId, levelNumber' });
    }

    if (levelNumber < 1 || levelNumber > 3) {
      return res.status(400).json({ error: 'Level number must be between 1 and 3' });
    }

    // Must have either transactionId (purchase) or freeTrialId (trial) to save progress
    // Allow saving progress for both purchased and free trial users
    if (!transactionId && !freeTrialId) {
      return res.status(400).json({ 
        error: 'Missing required field: transactionId or freeTrialId is required to save progress'
      });
    }

    // Calculate percentage score
    const percentageScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

    // Check if progress already exists for this user, card, and level
    const existingProgress = await GameProgress.findOne({
      userId: req.userId,
      cardId: cardId,
      levelNumber: levelNumber
    });

    let progress;

    if (existingProgress) {
      // Update existing progress (allow user to replay and improve score)
      existingProgress.packageId = packageId || existingProgress.packageId;
      existingProgress.productId = productId || existingProgress.productId;
      existingProgress.transactionId = transactionId || existingProgress.transactionId;
      existingProgress.freeTrialId = freeTrialId || existingProgress.freeTrialId;
      existingProgress.totalScore = totalScore;
      existingProgress.maxScore = maxScore;
      existingProgress.correctAnswers = correctAnswers;
      existingProgress.totalQuestions = totalQuestions;
      existingProgress.percentageScore = percentageScore;
      existingProgress.completedAt = new Date();

      progress = await existingProgress.save();
    } else {
      // Create new progress
      progress = await GameProgress.create({
        userId: req.userId,
        cardId: cardId,
        packageId: packageId || null,
        productId: productId || null,
        transactionId: transactionId || null,
        freeTrialId: freeTrialId || null,
        levelNumber: levelNumber,
        totalScore: totalScore,
        maxScore: maxScore,
        correctAnswers: correctAnswers,
        totalQuestions: totalQuestions,
        percentageScore: percentageScore
      });
    }

    // Populate references for response
    await progress.populate('cardId', 'title referenceCode category');
    await progress.populate('packageId', 'name');
    await progress.populate('productId', 'name');
    if (progress.freeTrialId) {
      await progress.populate('freeTrialId', 'uniqueCode endDate');
    }

    res.status(201).json({
      message: 'Game progress saved successfully',
      progress: progress
    });
  } catch (error) {
    console.error('Error saving game progress:', error);
    res.status(500).json({ error: 'Failed to save game progress' });
  }
});

// Get user's progress for a specific card
router.get('/card/:cardId', authenticateToken, async (req, res) => {
  try {
    const { cardId } = req.params;

    const progress = await GameProgress.find({
      userId: req.userId,
      cardId: cardId
    })
      .populate('cardId', 'title referenceCode category')
      .populate('packageId', 'name')
      .populate('productId', 'name')
      .sort({ levelNumber: 1, completedAt: -1 });

    res.json(progress);
  } catch (error) {
    console.error('Error fetching card progress:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// Get user's all progress
router.get('/user', authenticateToken, async (req, res) => {
  try {
    const progress = await GameProgress.find({
      userId: req.userId
    })
      .populate('cardId', 'title referenceCode category')
      .populate('packageId', 'name')
      .populate('productId', 'name')
      .sort({ completedAt: -1 })
      .limit(100);

    res.json(progress);
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

    const leaderboard = await GameProgress.find({
      cardId: cardId,
      levelNumber: parseInt(levelNumber)
    })
      .populate('userId', 'name email')
      .populate('cardId', 'title referenceCode')
      .sort({ totalScore: -1, completedAt: 1 }) // Highest score first, then earliest completion
      .limit(limit);

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

    const bestProgress = await GameProgress.findOne({
      userId: req.userId,
      cardId: cardId,
      levelNumber: parseInt(levelNumber)
    })
      .populate('cardId', 'title referenceCode')
      .sort({ totalScore: -1, completedAt: 1 });

    if (!bestProgress) {
      return res.status(404).json({ error: 'No progress found for this card and level' });
    }

    res.json(bestProgress);
  } catch (error) {
    console.error('Error fetching best progress:', error);
    res.status(500).json({ error: 'Failed to fetch best progress' });
  }
});

module.exports = router;

