const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const Card = require('../models/Card');

const router = express.Router();

// Public endpoint to get available levels for a product/package
router.get('/public/available-levels', async (req, res) => {
  try {
    const { packageId, productId } = req.query;
    const Package = require('../models/Package');
    const Product = require('../models/Product');
    
    const availableLevels = [];
    
    // Priority: productId > packageId
    if (productId) {
      const product = await Product.findById(productId).select('level1 level2 level3');
      if (product) {
        // Check each level
        if (product.level1 && product.level1.length > 0) {
          availableLevels.push(1);
        }
        if (product.level2 && product.level2.length > 0) {
          availableLevels.push(2);
        }
        if (product.level3 && product.level3.length > 0) {
          availableLevels.push(3);
        }
      }
    } else if (packageId) {
      // For packages, check if they have cards with questions
      // Since packages don't have level-specific arrays, if package has cards, all levels are available
      const packageDoc = await Package.findById(packageId).select('includedCardIds');
      if (packageDoc && packageDoc.includedCardIds && packageDoc.includedCardIds.length > 0) {
        const Card = require('../models/Card');
        
        // Check if package has cards with questions
        const cardsWithQuestions = await Card.find({ 
          _id: { $in: packageDoc.includedCardIds },
          'question.description': { $exists: true, $ne: '' }
        });
        
        // If package has cards with questions, all levels are available
        // (since game endpoint returns same cards for all levels in packages)
        if (cardsWithQuestions && cardsWithQuestions.length > 0) {
          availableLevels.push(1, 2, 3);
        }
      }
    }
    
    res.json({ availableLevels });
  } catch (error) {
    console.error('Error fetching available levels:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Public endpoint for game (no authentication required)
router.get('/public/game', async (req, res) => {
  try {
    const { level, packageId, productId, isDemo, targetAudience } = req.query;
    const Package = require('../models/Package');
    const Product = require('../models/Product');
    
    // For demo users, use product cards if productId is provided, otherwise fallback to isDemo cards
    if (isDemo === 'true') {
      // Priority: If productId is provided for demo, use product cards
      if (productId) {
        console.log(`🎮 Demo user with productId: ${productId}, targetAudience: ${targetAudience}, level: ${level}`);
        
        const product = await Product.findById(productId).select('level1 level2 level3 type');
        if (!product) {
          console.warn(`⚠️ Product ${productId} not found in database`);
          // Continue to fallback isDemo cards
        } else {
          console.log(`📦 Product found: ${product.name || productId}`);
          console.log(`📊 Product levels - Level1: ${product.level1?.length || 0} cards, Level2: ${product.level2?.length || 0} cards, Level3: ${product.level3?.length || 0} cards`);
          let cardIds = null;
          
          // Get cards for the specific level
          if (level === '1' && product.level1 && product.level1.length > 0) {
            cardIds = product.level1.map(id => id.toString());
            console.log(`📋 Level 1: Found ${cardIds.length} card IDs in product`);
          } else if (level === '2' && product.level2 && product.level2.length > 0) {
            cardIds = product.level2.map(id => id.toString());
            console.log(`📋 Level 2: Found ${cardIds.length} card IDs in product`);
          } else if (level === '3' && product.level3 && product.level3.length > 0) {
            cardIds = product.level3.map(id => id.toString());
            console.log(`📋 Level 3: Found ${cardIds.length} card IDs in product`);
          } else {
            console.warn(`⚠️ Product ${productId} has no cards in level ${level} arrays`);
          }
          
          if (cardIds && cardIds.length > 0) {
            // Fetch cards from product level
            const cardsMap = {};
            const fetchedCards = await Card.find({ _id: { $in: cardIds } });
            
            console.log(`📦 Fetched ${fetchedCards.length} cards from product level ${level} (requested ${cardIds.length} card IDs)`);
            
            // Create a map for quick lookup
            fetchedCards.forEach(card => {
              cardsMap[card._id.toString()] = card;
            });
            
            // Maintain the order from product level array
            const cards = [];
            cardIds.forEach(cardId => {
              const card = cardsMap[cardId];
              if (card) {
                cards.push(card);
              } else {
                console.warn(`⚠️ Card ID ${cardId} not found in database`);
              }
            });
            
            console.log(`📋 Processing ${cards.length} cards to extract questions`);
            
            // Aggregate questions from product cards
            const allQuestions = [];
            cards.forEach(card => {
              if (card.question && card.question.description) {
                allQuestions.push({
                  ...card.question.toObject(),
                  cardId: card._id,
                  cardTitle: card.title
                });
              } else {
                console.warn(`⚠️ Card ${card._id} (${card.title}) has no question or question description`);
              }
            });
            
            console.log(`✅ Extracted ${allQuestions.length} questions from ${cards.length} cards`);
            
            // If no questions found, return empty but don't fallback to isDemo cards
            // This allows frontend to show proper error message
            if (allQuestions.length === 0) {
              console.warn(`⚠️ No questions found in product cards for level ${level}`);
              return res.json({
                level: level ? parseInt(level) : null,
                questions: [],
                totalAvailable: 0,
                error: 'No questions available in product cards for this level'
              });
            }
            
            // Limit based on target audience: B2C = 30 max, B2B/B2E = 30 per level
            const maxCards = targetAudience === 'B2C' ? 30 : 30; // 30 per level for all
            const limitedQuestions = allQuestions.slice(0, maxCards);
            
            console.log(`✅ Found ${limitedQuestions.length} product cards for demo (${targetAudience}, level ${level})`);
            
            res.json({
              level: level ? parseInt(level) : null,
              questions: limitedQuestions,
              totalAvailable: allQuestions.length
            });
            return;
          } else {
            console.warn(`⚠️ Product ${productId} has no cards in level ${level} arrays`);
          }
        }
      }
      
      // Fallback: If no productId or product has no cards, use isDemo cards
      const query = {
        isDemo: true,
        isDeleted: { $ne: true } // Exclude soft deleted cards
      };
      
      // Filter by target audience if provided
      if (targetAudience) {
        query.targetAudiences = targetAudience; // Filter by target audience (B2C, B2B, B2E)
      }
      
      console.log(`🎮 Fetching demo cards (fallback) for targetAudience: ${targetAudience}, level: ${level}, query:`, query);
      
      // Fetch cards directly from cards table
      const fetchedCards = await Card.find(query).sort({ createdAt: -1 }); // Sort by newest first
      
      // Aggregate all questions from all filtered cards
      const allQuestions = [];
      
      fetchedCards.forEach(card => {
        if (card.question && card.question.description) {
          allQuestions.push({
            ...card.question.toObject(),
            cardId: card._id,
            cardTitle: card.title
          });
        }
      });
      
      // Limit based on target audience and level
      let maxCards = 30; // Default 30 per level
      if (targetAudience === 'B2C') {
        maxCards = 30; // B2C gets 30 total (only Level 1)
      } else if (targetAudience === 'B2B' || targetAudience === 'B2E') {
        maxCards = 30; // B2B/B2E gets 30 per level (up to 90 total across 3 levels)
      }
      
      const limitedQuestions = allQuestions.slice(0, maxCards);
      
      console.log(`✅ Found ${limitedQuestions.length} demo cards for ${targetAudience} (level: ${level || 'all'})`);
      
      res.json({
        level: level ? parseInt(level) : null,
        questions: limitedQuestions,
        totalAvailable: allQuestions.length
      });
      return;
    }
    
    // Regular users - use product/package logic
    let cardIds = null;
    
    // Priority: productId > packageId
    if (productId) {
      // Regular users - fetch cards from product's level arrays based on level
      const product = await Product.findById(productId).select('level1 level2 level3 type');
      if (product) {
        // Get cards for the specific level
        if (level === '1' && product.level1 && product.level1.length > 0) {
          cardIds = product.level1.map(id => id.toString());
        } else if (level === '2' && product.level2 && product.level2.length > 0) {
          cardIds = product.level2.map(id => id.toString());
        } else if (level === '3' && product.level3 && product.level3.length > 0) {
          cardIds = product.level3.map(id => id.toString());
        }
      }
      
      // If no cards for this level, return empty
      if (!cardIds || cardIds.length === 0) {
        return res.json({
          level: level ? parseInt(level) : null,
          questions: [],
          totalAvailable: 0
        });
      }
    } else if (packageId) {
      // Fallback to package if no productId
      const packageDoc = await Package.findById(packageId).select('includedCardIds');
      if (packageDoc && packageDoc.includedCardIds && packageDoc.includedCardIds.length > 0) {
        cardIds = packageDoc.includedCardIds.map(id => id.toString());
      } else {
        // If package has no cards, return empty
        return res.json({
          level: level ? parseInt(level) : null,
          questions: [],
          totalAvailable: 0
        });
      }
    }
    
    const query = {};
    if (cardIds) {
      query._id = { $in: cardIds };
    }
    
    // Don't filter soft deleted cards for game play - users who purchased should still see them
    // Fetch cards (filtered by product level or package)
    const cardsMap = {};
    const fetchedCards = await Card.find(query);
    
    // Create a map for quick lookup
    fetchedCards.forEach(card => {
      cardsMap[card._id.toString()] = card;
    });
    
    // Maintain the order from cardIds array (product level order)
    const cards = [];
    if (cardIds && cardIds.length > 0) {
      // Iterate through cardIds in the order they appear in product level arrays
      cardIds.forEach(cardId => {
        const card = cardsMap[cardId];
        if (card) {
          cards.push(card);
        }
      });
    } else {
      // Fallback: if no cardIds order, use fetched cards (shouldn't happen)
      cards.push(...fetchedCards);
    }
    
    // Aggregate all questions from all filtered cards (in order)
    const allQuestions = [];
    
    cards.forEach(card => {
      if (card.question) {
        allQuestions.push({
          ...card.question.toObject(),
          cardId: card._id,
          cardTitle: card.title
        });
      }
    });
    
    // Return aggregated questions
    // For regular users, limit to 30 per level
    const limit = 30;
    res.json({
      level: level ? parseInt(level) : null,
      questions: allQuestions.slice(0, limit),
      totalAvailable: allQuestions.length
    });
  } catch (error) {
    console.error('Error fetching game cards:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', authenticateToken, checkPermission('cards'), async (req, res) => {
  try {
    const { status, category, targetAudience, tag, search } = req.query;
    const query = {};

    if (status) query.status = status;
    if (category) query.category = category;
    if (targetAudience) query.targetAudiences = targetAudience;
    if (tag) query.tags = tag;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter out soft deleted cards for admin panel
    query.isDeleted = { $ne: true };

    const cards = await Card.find(query).sort({ updatedAt: -1 });
    res.json(cards);
  } catch (error) {
    console.error('Error fetching cards:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authenticateToken, checkPermission('cards'), async (req, res) => {
  try {
    const card = await Card.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    res.json(card);
  } catch (error) {
    console.error('Error fetching card:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/',
  authenticateToken,
  checkPermission('cards'),
  [
    body('title').notEmpty().trim(),
    body('questions').optional().isArray().withMessage('Questions must be an array')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      console.log('=== CREATE CARD REQUEST ===');
      
      // Validate and clean question structure
      const q = req.body.question || {};
      
      // Validate required fields
      const missingFields = [];
      if (!q.description || !q.description.trim()) {
        missingFields.push('description');
      }
      
      if (missingFields.length > 0) {
        throw new Error(`Question: Missing required fields: ${missingFields.join(', ')}`);
      }
      
      // Validate answers - must have exactly 4 if provided
      if (q.answers && q.answers.length > 0) {
        if (q.answers.length !== 4) {
          throw new Error(`Question: Question must have exactly 4 answers`);
        }
        // Validate that all answers have text
        const emptyAnswers = q.answers.filter((a, idx) => !a.text || !a.text.trim());
        if (emptyAnswers.length > 0) {
          throw new Error(`Question: All 4 answers must have text`);
        }
      }
      
      // Ensure answers array has 4 items (fill with empty if needed)
      const answers = q.answers && q.answers.length === 4
        ? q.answers
        : [
            { text: q.answers?.[0]?.text || '', scoring: q.answers?.[0]?.scoring || 0 },
            { text: q.answers?.[1]?.text || '', scoring: q.answers?.[1]?.scoring || 0 },
            { text: q.answers?.[2]?.text || '', scoring: q.answers?.[2]?.scoring || 0 },
            { text: q.answers?.[3]?.text || '', scoring: q.answers?.[3]?.scoring || 0 }
          ];
      
      const question = {
        description: q.description.trim(),
        answers: answers.map(a => ({
          text: a.text || '',
          scoring: a.scoring || 0
        })),
        feedback: q.feedback || '',
        attachments: (q.attachments || []).filter(att => att && att.type && att.url && att.title).map(att => ({
          type: att.type,
          url: att.url,
          title: att.title
        }))
      };
      
      const cardData = {
        title: req.body.title.trim(),
        category: req.body.category || '',
        visibility: req.body.visibility || 'public',
        targetAudiences: req.body.targetAudiences || [],
        isDemo: req.body.isDemo || false,
        tags: req.body.tags || [],
        question: question
      };
      
      console.log('Card data to save:', JSON.stringify(cardData, null, 2));
      console.log('Question created successfully');
      
      const card = await Card.create(cardData);
      console.log('Card created successfully');
      res.status(201).json(card);
    } catch (error) {
      console.error('Error creating card:', error);
      console.error('Error details:', error.message);
      if (error.errors) {
        console.error('Validation errors:', JSON.stringify(error.errors, null, 2));
      }
      // Return concise, specific error messages
      let errorMessage = 'Failed to create card';
      if (error.message) {
        errorMessage = error.message;
      } else if (error.errors) {
        const firstError = Object.values(error.errors)[0];
        errorMessage = firstError?.message || errorMessage;
      }
      res.status(500).json({ error: errorMessage });
    }
  }
);

router.put(
  '/:id',
  authenticateToken,
  checkPermission('cards'),
  [
    body('title').optional().notEmpty().trim(),
    body('questions').optional().isArray().withMessage('Questions must be an array')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      console.log('=== UPDATE CARD REQUEST ===');
      console.log('Card ID:', req.params.id);

      const updateData = {};
      
      if (req.body.title !== undefined) updateData.title = req.body.title.trim();
      if (req.body.category !== undefined) updateData.category = req.body.category;
      if (req.body.visibility !== undefined) updateData.visibility = req.body.visibility;
      if (req.body.targetAudiences !== undefined) updateData.targetAudiences = req.body.targetAudiences;
      if (req.body.isDemo !== undefined) updateData.isDemo = req.body.isDemo;
      if (req.body.tags !== undefined) updateData.tags = req.body.tags;
      
      // Only update question if it is explicitly provided
      if (req.body.question !== undefined) {
        const q = req.body.question || {};
        
        // Validate required fields
        const missingFields = [];
        if (!q.description || !q.description.trim()) {
          missingFields.push('description');
        }
        
        if (missingFields.length > 0) {
          throw new Error(`Question: Missing required fields: ${missingFields.join(', ')}`);
        }
        
        // Validate answers - must have exactly 4 if provided
        if (q.answers && q.answers.length > 0) {
          if (q.answers.length !== 4) {
            throw new Error(`Question: Question must have exactly 4 answers`);
          }
          // Validate that all answers have text
          const emptyAnswers = q.answers.filter((a, idx) => !a.text || !a.text.trim());
          if (emptyAnswers.length > 0) {
            throw new Error(`Question: All 4 answers must have text`);
          }
        }
        
        // Ensure answers array has 4 items (fill with empty if needed)
        const answers = q.answers && q.answers.length === 4
          ? q.answers
          : [
              { text: q.answers?.[0]?.text || '', scoring: q.answers?.[0]?.scoring || 0 },
              { text: q.answers?.[1]?.text || '', scoring: q.answers?.[1]?.scoring || 0 },
              { text: q.answers?.[2]?.text || '', scoring: q.answers?.[2]?.scoring || 0 },
              { text: q.answers?.[3]?.text || '', scoring: q.answers?.[3]?.scoring || 0 }
            ];
        
        updateData.question = {
          description: q.description.trim(),
          answers: answers.map(a => ({
            text: a.text || '',
            scoring: a.scoring || 0
          })),
          feedback: q.feedback || '',
          attachments: (q.attachments || []).filter(att => att && att.type && att.url && att.title).map(att => ({
            type: att.type,
            url: att.url,
            title: att.title
          }))
        };
      }

      console.log('Update data:', JSON.stringify(updateData, null, 2));
      
      const card = await Card.findByIdAndUpdate(
        req.params.id,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!card) {
        return res.status(404).json({ error: 'Card not found' });
      }

      console.log('Card updated successfully');
      res.json(card);
    } catch (error) {
      console.error('Error updating card:', error);
      console.error('Error details:', error.message);
      if (error.errors) {
        console.error('Validation errors:', JSON.stringify(error.errors, null, 2));
      }
      // Return concise, specific error messages
      let errorMessage = 'Failed to update card';
      if (error.message) {
        errorMessage = error.message;
      } else if (error.errors) {
        const firstError = Object.values(error.errors)[0];
        errorMessage = firstError?.message || errorMessage;
      }
      res.status(500).json({ error: errorMessage });
    }
  }
);

router.post(
  '/:id/question/attachments',
  authenticateToken,
  checkPermission('cards'),
  [
    body('type').isIn(['audio', 'video', 'pdf', 'word', 'link']).withMessage('Invalid attachment type'),
    body('url').notEmpty().withMessage('URL is required'),
    body('title').notEmpty().withMessage('Title is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const card = await Card.findById(req.params.id);
      if (!card) {
        return res.status(404).json({ error: 'Card not found' });
      }

      if (!card.question) {
        return res.status(404).json({ error: 'Question not found' });
      }

      const newAttachment = {
        type: req.body.type,
        url: req.body.url,
        title: req.body.title
      };

      if (!card.question.attachments) {
        card.question.attachments = [];
      }

      card.question.attachments.push(newAttachment);
      await card.save();

      res.status(200).json(card);
    } catch (error) {
      console.error('Error adding attachment:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.delete('/:id/question/attachments/:attachmentId', authenticateToken, checkPermission('cards'), async (req, res) => {
    try {
      const card = await Card.findById(req.params.id);
      if (!card) {
        return res.status(404).json({ error: 'Card not found' });
      }

      if (!card.question) {
        return res.status(404).json({ error: 'Question not found' });
      }

      card.question.attachments = card.question.attachments.filter(
        att => att._id.toString() !== req.params.attachmentId
      );
      await card.save();

      res.json(card);
    } catch (error) {
      console.error('Error removing attachment:', error);
      res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/:id', authenticateToken, checkPermission('cards'), async (req, res) => {
  try {
    const cardId = req.params.id;
    const card = await Card.findById(cardId);
    
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    // Check if card is already soft deleted
    if (card.isDeleted) {
      return res.status(400).json({ error: 'Card is already deleted' });
    }

    // Check if card is used in any purchased products/packages
    const Product = require('../models/Product');
    const Package = require('../models/Package');
    const Transaction = require('../models/Transaction');
    const FreeTrial = require('../models/FreeTrial');

    let isCardPurchased = false;
    let purchaseDetails = [];

    // Check if card is in any product's levels and that product has paid transactions
    const productsWithCard = await Product.find({
      $or: [
        { level1: cardId },
        { level2: cardId },
        { level3: cardId }
      ]
    }).select('_id name level1 level2 level3');

    if (productsWithCard.length > 0) {
      // Check if any of these products have paid transactions
      for (const product of productsWithCard) {
        const hasPaidTransactions = await Transaction.exists({
          productId: product._id,
          status: 'paid'
        });

        if (hasPaidTransactions) {
          isCardPurchased = true;
          purchaseDetails.push({
            type: 'product',
            id: product._id,
            name: product.name
          });
        }
      }
    }

    // Check if card is in any package's includedCardIds and that package has paid transactions or free trials
    const packagesWithCard = await Package.find({
      includedCardIds: cardId
    }).select('_id name includedCardIds');

    if (packagesWithCard.length > 0) {
      // Check if any of these packages have paid transactions or free trials
      for (const packageDoc of packagesWithCard) {
        const hasPaidTransactions = await Transaction.exists({
          packageId: packageDoc._id,
          status: 'paid'
        });

        const hasFreeTrials = await FreeTrial.exists({
          packageId: packageDoc._id,
          status: 'active'
        });

        if (hasPaidTransactions || hasFreeTrials) {
          isCardPurchased = true;
          purchaseDetails.push({
            type: 'package',
            id: packageDoc._id,
            name: packageDoc.name
          });
        }
      }
    }

    // If card is purchased, perform soft delete
    if (isCardPurchased) {
      card.isDeleted = true;
      card.deletedAt = new Date();
      await card.save();

      return res.json({ 
        message: 'Card has been soft deleted because it is associated with purchased products/packages. It will remain in the database but will not be visible in admin panel.',
        softDeleted: true,
        purchaseDetails: purchaseDetails
      });
    }

    // If card is not purchased, perform hard delete
    await Card.findByIdAndDelete(cardId);

    // Remove card from products' level arrays
    await Product.updateMany(
      {
        $or: [
          { level1: cardId },
          { level2: cardId },
          { level3: cardId }
        ]
      },
      {
        $pull: {
          level1: cardId,
          level2: cardId,
          level3: cardId
        }
      }
    );

    // Remove card from packages' includedCardIds
    await Package.updateMany(
      { includedCardIds: cardId },
      { $pull: { includedCardIds: cardId } }
    );

    res.json({ 
      message: 'Card deleted successfully',
      softDeleted: false
    });
  } catch (error) {
    console.error('Error deleting card:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

